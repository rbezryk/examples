let sendResponse = require('../libs/utils').sendResponse;
let metricModel = require('../models/metric');
let http_status = require('../config/constant').HTTP_STATUS;
let async = require('async');
require('../config/global');
let HttpResponse = require('../components/http-response');
let jsVm = require('../components/js-virtual-machine');
let commonChartData = require('../components/common-chart-data');
let loadChartModuleSrc = require('../components/load-chart-module-src');
let translation = require('../components/translation');
let apiCallTrack = require('../components/api-call-track');
let separateThread = require('../components/separate-thread');

let dashboardChart = require('../../resources/json/dashboard');
let metricCharts = require('../../resources/json/metric');
let trendlines = require('../../resources/json/trendline');

let orm = require('../components/orm/orm');
let ORM = require('sequelize');
let ChartModel = require('../models/orm-models').Chart;
let MetricModel = require('../models/orm-models').Metric;
let ChartDisplayTypeModel = require('../models/orm-models').ChartDisplayType;
let MetricChartModel = require('../models/orm-models').MetricChart;
let TranslationModel = require('../models/orm-models').Translation;
let SqlQueryModel = require('../models/orm-models').SqlQuery;
let colors = require('./../components/colors');

module.exports = {
    getMetricList: getMetricList,
    getMetricCharts: getMetricCharts,
    getMetricSimilarCharts: getMetricSimilarCharts,
    getChartDetails: getChartDetails,
    getTrendLineChart: getTrendLineChart,
    setChartsOrder: setChartsOrder,
};

/**
 * Return all active metric
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
function getMetricList(req, res) {
    apiCallTrack(function (trackApi) {
        MetricModel.findAll({
            where: {
                trendata_metric_status: '1'
            }
        })
        .map(function (item) {
            return Promise.props({
                id:         item.trendata_metric_id,
                created_on: item.created_at,
                status:     item.trendata_metric_status,
                icon:       item.trendata_metric_icon,
                title:      TranslationModel.getTranslation(item.trendata_metric_title_token, 1)
            });
        })
        .then(function (data) {
            trackApi(req);
            res.json(data);
        })
        .catch(function (err) {
            trackApi(req, err);
            res.status(500).send(err.stack);
        });
    });
}

/**
 * This api function returns the metric chart
 * @param req
 * @param res
 */
function getMetricCharts(req, res) {
    apiCallTrack(function (trackApi) {
        if (!req.query.metric_id) {
            trackApi(req, new Error('Required Parameter Missing'));
            return res.status(400).json('Required Parameter Missing');
        }

        let metricID = parseInt(req.query.metric_id);

        MetricChartModel.findAll({
            include: [
                {
                    model: MetricModel,
                    required: true,
                    where: {
                        trendata_metric_id: metricID
                    }
                },
                {
                    model: ChartModel,
                    required: true,
                    include: [
                        {
                            model: ChartDisplayTypeModel,
                            required: true
                        },
                        {
                            model: SqlQueryModel,
                            required: false
                        }
                    ]
                }
            ],
            order: [
                ['trendata_metric_chart_order', 'ASC']
            ]
        })
        .reduce(function (accumulator, val) {
            return Promise.props({
                id:           val.Chart.trendata_chart_id,
                created_on:   val.created_at,
                status:       val.Chart.trendata_chart_status,
                default_chart_display_type: val.Chart.ChartDisplayType.trendata_chart_display_type_key,
                position_x:   val.Chart.trendata_chart_position_x,
                position_y:   val.Chart.trendata_chart_position_y,
                width:        val.Chart.trendata_chart_width,
                height:       val.Chart.trendata_chart_height,
                chart_type:   val.Chart.trendata_chart_type,
                sql_template: val.Chart.SqlQuery,
                title:        TranslationModel.getTranslation(val.Chart.trendata_chart_title_token, 1),
                description:  TranslationModel.getTranslation(val.Chart.trendata_chart_description_token, 1)
            })
            .then(function (data) {
                let chart_key = val.Chart.trendata_chart_key;
                let sqlTemplate = data.sql_template;
                data.sql_template = undefined;

                let context = {
                    orm: orm,
                    ORM: ORM,
                    ormModels: require('../models/orm-models'),
                    Date: Date,
                    req: req,
                    commonChartData: commonChartData,
                    Error: Error,
                    _: _,
                    translation: translation,
                    separateThread: separateThread,
                    moment: require('moment'),
                    knex: require('../components/knex'),
                    colors: colors
                };

                if (sqlTemplate && sqlTemplate.trendata_sql_query_template && (sqlTemplate.trendata_sql_query_custom_source || sqlTemplate.trendata_sql_query_module_path)) {
                    data.chart_data = orm.query(sqlTemplate.trendata_sql_query_template, {
                        type: ORM.QueryTypes.SELECT
                    }).then(function (rows) {
                        if (sqlTemplate.trendata_sql_query_module_path) {
                            return loadChartModuleSrc(sqlTemplate.trendata_sql_query_module_path).then(function (code) {
                                return jsVm(code, rows, {
                                    contextProps: context
                                });
                            });
                        }

                        return jsVm(sqlTemplate.trendata_sql_query_custom_source, rows, {
                            contextProps: context
                        });
                    });
                } else if (sqlTemplate && (sqlTemplate.trendata_sql_query_custom_source || sqlTemplate.trendata_sql_query_module_path)) {
                    data.chart_data = Promise.resolve().then(function () {
                        if (sqlTemplate.trendata_sql_query_module_path) {
                            return loadChartModuleSrc(sqlTemplate.trendata_sql_query_module_path).then(function (code) {
                                return jsVm(code, undefined, {
                                    contextProps: context
                                });
                            });
                        }

                        return jsVm(sqlTemplate.trendata_sql_query_custom_source, undefined, {
                            contextProps: context
                        });
                    });
                } else if (dashboardChart[chart_key]) {
                    data.chart_data = dashboardChart[chart_key].chart_charts[0];
                }

                return Promise.props(data);
            })
            .then(function (data) {
                switch (data.chart_type) {
                    case '1':
                        if (data.chart_data && data.chart_data.data) {
                            data.chart_data.decimals = '1';
                        }

                        accumulator.charts.push(data);
                        break;
                    case '2':
                        accumulator.value_box.push(data);
                        break;
                    case '3':
                        accumulator.table.push(data);
                        break;
                    default:
                    // ...
                }

                return accumulator;
            });
        }, {
            charts: [],
            value_box: [],
            table: []
        })
        .then(function (data) {
            trackApi(req);
            res.json(data);
        })
        .catch(function (err) {
            trackApi(req, err);
            res.status(500).send(err.stack);
        });
    });
}

/*
 * this api function returns the similar chart
 */
function getMetricSimilarCharts(req, res) {
    if (!req.query.chart_id) {
        return res.status(400).json('Required Parameter Missing');
    }

    let chartID = parseInt(req.query.chart_id);
    let jsonData = [];

    metricModel.getMetircSimilarChartList(chartID,callback);

    function callback(err, rows) {
        if (err) {
            sendResponse(res, http_status.server_error, err);
        } else if (!rows.length) {
            sendResponse(res, http_status.success, jsonData);
        } else {
            async.eachSeries(rows, function (val, next) {
                let jsonTemp = {
                    "id": val.trendata_chart_id,
                    "created_on": val.trendata_chart_created_on,
                    "status": val.trendata_chart_status,
                    "default_chart_display_type": val.trendata_chart_display_type_key,
                    "position_x": val.trendata_chart_position_x,
                    "position_y": val.trendata_chart_position_y,
                    "width": val.trendata_chart_width,
                    "height": val.trendata_chart_height,
                    "chart_type": val.trendata_chart_type,
                };

                let chart_key =  'metrics_' + val.trendata_chart_key;

                if (metricCharts[chart_key]) {
                    jsonTemp["chart_data"] = metricCharts[chart_key].chart_charts[0];
                }

                global.getTranslation(val.trendata_chart_title_token,function(err,val1){
                    if (err) {
                        throw err;
                    }

                    jsonTemp["title"] = val1;

                    //Translate description text
                    global.getTranslation(val.trendata_chart_description_token,function(err,val2){
                        if (err) {
                            throw err;
                        }

                        jsonTemp["description"] = val2;
                        jsonData.push(jsonTemp);
                        next();
                    });

                });
            }, function (err) {
                if (err) {
                    sendResponse(res, http_status.server_error, null);
                } else {
                    sendResponse(res, http_status.success, jsonData);
                }
            });
        }
    }
}

/**
 * This api function returns the chart details
 * @param req
 * @param res
 */
function getChartDetails(req, res) {
    apiCallTrack(function (trackApi) {
        if (!req.query.chart_id) {
            trackApi(req);
            return res.status(400).json('Required Parameter Missing');
        }

        let chartID = parseInt(req.query.chart_id);

        MetricChartModel.findOne({
            include: [
                {
                    model: ChartModel,
                    where: {
                        trendata_chart_id: chartID,
                        trendata_chart_status: '1'
                    },
                    include: [
                        {
                            model: ChartDisplayTypeModel
                        }
                    ]
                }
            ]
        })
        .then(function (row) {
            if (! row) {
                throw new HttpResponse({});
            }

            return row;
        })
        .then(function (row) {
            return Promise.props({
                id:          row.Chart.trendata_chart_id,
                created_on:  row.Chart.created_at,
                status:      row.Chart.trendata_chart_status,
                default_chart_display_type: row.Chart.ChartDisplayType.trendata_chart_display_type_key,
                position_x:  row.Chart.trendata_chart_position_x,
                position_y:  row.Chart.trendata_chart_position_y,
                width:       row.Chart.trendata_chart_width,
                height:      row.Chart.trendata_chart_height,
                chart_type:  row.Chart.trendata_chart_type,
                title:       TranslationModel.getTranslation(row.trendata_chart_title_token),
                description: TranslationModel.getTranslation(row.trendata_chart_description_token)
            });
        })
        .then(function (row) {
            let chart_key = 'metrics_' + row.Chart.trendata_chart_key;

            if (metricCharts[chart_key]) {
                row.chart_data = metricCharts[chart_key].chart_charts[0];
            }

            return row;
        })
        .then(function (row) {
            trackApi(req);
            res.json(row);
        })
        .catch(HttpResponse, function (err) {
            trackApi(req);
            err.json(res);
        })
        .catch(function (err) {
            trackApi(req, err);
            res.status(500).send(err.stack);
        });
    });
}

/**
 * This api function returns the Trendline
 * @param req
 * @param res
 */
function getTrendLineChart(req, res) {
    apiCallTrack(function (trackApi) {
        if (! req.query.chart_id) {
            trackApi(req);
            return res.status(400).json('Required Parameter Missing');
        }

        let chartID = parseInt(req.query.chart_id);

        MetricChartModel.findOne({
            include: [
                {
                    model: ChartModel,
                    where: {
                        trendata_chart_id: chartID,
                        trendata_chart_status: '1'
                    },
                    include: [
                        {
                            model: ChartDisplayTypeModel
                        }
                    ]
                }
            ]
        })
        .then(function (row) {
            if (! row) {
                throw new HttpResponse({});
            }

            return row;
        })
        .then(function (row) {
            return Promise.props({
                id:          row.Chart.trendata_chart_id,
                created_on:  row.Chart.created_at,
                status:      row.Chart.trendata_chart_status,
                default_chart_display_type: row.Chart.ChartDisplayType.trendata_chart_display_type_key,
                position_x:  row.Chart.trendata_chart_position_x,
                position_y:  row.Chart.trendata_chart_position_y,
                width:       row.Chart.trendata_chart_width,
                height:      row.Chart.trendata_chart_height,
                chart_type:  row.Chart.trendata_chart_type,
                chart:       TranslationModel.getTranslation(row.Chart.trendata_chart_title_token),
                description: TranslationModel.getTranslation(row.Chart.trendata_chart_description_token),
            });
        })
        .then(function (row) {
            let chart_key = 'trendline_' + row.Chart.trendata_chart_key;

            if (trendlines[chart_key]) {
                row.chart_data = trendlines[chart_key].chart_charts[0];
            }

            return row;
        })
        .then(function (row) {
            trackApi(req);
            res.json(row);
        })
        .catch(HttpResponse, function (err) {
            trackApi(req);
            err.json(res);
        })
        .catch(function (err) {
            trackApi(req, err);
            res.status(500).send(err.stack);
        });
    });
}

/**
 * @param req
 * @param res
 */
function setChartsOrder(req, res) {
    apiCallTrack(function (trackApi) {
        let metricId = req.params.id;
        let chartsIds = req.body;

        Promise.map(chartsIds, function (item) {
            return parseInt(item);
        })
        .each(function (item, index) {
            return MetricChartModel.update({
                trendata_metric_chart_order: index
            }, {
                where: {
                    trendata_metric_id: metricId,
                    trendata_chart_id: item
                }
            });
        })
        .then(function () {
            trackApi(req);
            res.json({
                status: 'success'
            });
        })
        .catch(function (err) {
            trackApi(req, err);
            res.status(500).send(err.stack);
        });
    });
}
