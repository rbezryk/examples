const Issue = require('../models/Issue');
const Unit = require('../models/Unit');
const translationService = require('../services/translationService')();
const mailService = require("./mailService")();
const Bookshelf =require('../utils/bookshelf');
const knex = Bookshelf.knex;
const fs = require('fs');
const guid = require('guid');
const pdf = require('html-pdf');
const momentTimezone = require('moment-timezone');
const AcceptanceReport = require('../models/AcceptanceReport');
const replaceall = require("replaceall");
const config = require('../config/config');

const BUCKET_NAME = process.env.APP_ENV == 'PROD' ? config.aws.imagesBucket.PROD : config.aws.imagesBucket.TEST;
const REPORT_DATE_FORMAT = 'MMM DD,YYYY';

let acceptanceReportContent = "";
let acceptanceReportRowIteraror = "";
let i18n = require('i18n');
i18n.configure({
    locales: ['en', 'es'],
    directory: 'server/locales',
});

module.exports = function () {
    let module = {};
    let usedLanguagesArray = translationService.usedLanguages();

    let initTemplates = function(){
        fs.readFile('server/reports/acceptanceReport/content.html', 'utf8', function(err, html) {
            acceptanceReportContent = html;
        });

        fs.readFile('server/reports/acceptanceReport/issueRowIterator.html', 'utf8', function(err, html) {
            acceptanceReportRowIteraror = html;
        });
    };

    initTemplates();

    module.send = function(req, res, userId, sendBody, timezone, done) {
        let outPdf = "";
        let projectDetails = {};
        let isNeededRow = false;

        let autoTranslate = req.headers['auto-translate'] == 'true';
        let language = req.headers['language'] || 'en';

        let userName = sendBody.user_name;
        let projectId = sendBody.project_id;
        let issues = sendBody.issues;
        let units = sendBody.units;
        let companyId = sendBody.company_id;
        let qaSignature = sendBody.qa_signature || "";
        let managerSignature = sendBody.manager_signature || "";
        let dateSignature = sendBody.date_signature || new Date();
        let emailTo = sendBody.email_to;
        let fromEmail = sendBody.from_email;
        let emailSubject = sendBody.email_subject || "";
        let emailMessage = sendBody.email_message || "";

        i18n.init(req, res);
        req.setLocale(language);
        momentTimezone.locale(language);

        return Unit.forge().query(function (qb) {
            qb.select([
                knex.raw('array_agg(units.name) as units'),
                'areas.name as area_name',
                'projects.name as project_name',
                'companies.name as company_name',
                'companies.logo as company_logo',
            ]);

            qb.leftJoin("areas", 'areas.id', '=', 'units.area_id');
            qb.leftJoin("projects", 'projects.id', '=', 'areas.project_id');
            qb.leftJoin("projects_companies", 'projects_companies.project_id', '=', 'projects.id');
            qb.leftJoin("companies", 'companies.id', '=', 'projects_companies.company_id');

            qb.whereIn('units.id', units);
            qb.andWhere('companies.id', companyId);
            qb.andWhere('projects_companies.is_deleted', false);

            qb.groupBy(['areas.id', 'projects.id', 'companies.id']);

            return qb.debug();
        })
        .fetchAll({})
        .then(function(unitsByAreasName) {
            let pageToFetch = {
                withRelated: []
            };

            unitsByAreasName = unitsByAreasName.toJSON();
            isNeededRow = unitsByAreasName.length > 1;

            projectDetails.projectName = unitsByAreasName[0].project_name;
            projectDetails.companyLogo = unitsByAreasName[0].company_logo;
            projectDetails.companyName = unitsByAreasName[0].company_name;
            projectDetails.units = "";
            projectDetails.areas = "";

            unitsByAreasName.map(function(currentArea) {
                projectDetails.areas += currentArea.area_name + ", ";
                currentArea.units.map(function(unit) {
                    projectDetails.units += unit + ", ";
                });
            });

            projectDetails.units = projectDetails.units.substring(0, projectDetails.units.length -2);
            projectDetails.areas = projectDetails.areas.substring(0, projectDetails.areas.length -2);

            if (autoTranslate) {
                pageToFetch.withRelated.push({'translations': function(qb){
                    qb.where('issues_translation.language_id', language);
                }});
            }

            return Issue.forge().query(function (qb) {
                    qb.select([
                        'issues.id',
                        'issues.description',
                        'issues.original_language_id',
                        'contractor_companies.description as contractor',
                        'areas.name as area_name',
                        'units.name as unit_name',
                    ]);

                    qb.leftJoin("contractor_companies", 'contractor_companies.id', '=', 'issues.contractor_id');
                    qb.leftJoin("units", 'units.id', '=', 'issues.unit_id');
                    qb.leftJoin("areas", 'areas.id', '=', 'units.area_id');

                    qb.whereIn('issues.id', issues);

                    qb.orderBy('area_name', 'asc');
                    qb.orderBy('unit_name', 'asc');
                    qb.orderBy('issues.description', 'asc');

                    return qb;
                })
                .fetchAll(pageToFetch)
        })
        .then(function (issues) {
            return module.translateIfNeeded(issues.models, language, autoTranslate, userId);
        })
        .then(function (issues) {
            return module.createReportContent(res, userName, issues, qaSignature, managerSignature, dateSignature, projectDetails, isNeededRow, timezone);
        })
        .then(function (format) {
            return new Promise(function(resolve, reject) {
                pdf.create(format, {timeout: 300000})
                   .toBuffer(function(err, buffer) {
                        if (err){
                            reject(err);
                        } else {
                            outPdf = new Buffer(buffer, 'uint8').toString('base64');
                            resolve(outPdf);
                        }
                    });
            });
        })
        .then(function() {
            let acceptanceReport = {
                id: guid.raw(),
                user_id: userId,
                project_id: projectId,
                company_id: companyId,
                qa_signature: qaSignature,
                manager_signature: managerSignature,
                date_signature: dateSignature,
                email_to: emailTo,
                email_subject: emailSubject,
                email_message: emailMessage,
            };

            return AcceptanceReport
                .forge()
                .save(acceptanceReport, null)
                .then(function (acceptanceReportAfterSave) {
                    return acceptanceReportAfterSave
                        .issues()
                        .attach(issues)
                        .then(function(){
                            return acceptanceReportAfterSave
                                .units()
                                .attach(units)
                                .then(function() {
                                    return acceptanceReportAfterSave.toJSON();
                                });
                        });
                });
        })
        .then(function(report) {
            return knex('units').whereIn('units.id', units).update({status_id: 6, report_id: report.id, user_id: userId});
        })
        .then(function() {
            mailService.sendBuildupEmailWithAttachment(emailTo, fromEmail, emailSubject, emailMessage, outPdf, res.__('Acceptance Report') + ".pdf", done);
        })
        .catch(function(err) {
            err.method = "acceptanceReportService - send";
            err.userId = userId;
            done(err);
        });
    };

    module.createReportContent = function(res, userName, issues, qaSignature, managerSignature, dateSignature, projectDetails, isNeededRow, timezone) {
        let format = acceptanceReportContent;

        if (!issues || issues.length == 0) {
            return "";
        } else {
            let row = "";
            let rows = "";

            if (issues.length > 0) {
                format = format.replace('{{noIssueMode}}', '');
            } else {
                format = format.replace('{{noIssueMode}}', 'display:none');
            }

            issues.forEach(function(issue) {
                issue = issue.toJSON();
                row = acceptanceReportRowIteraror;
                row = row.replace('{{contractor}}', issue.contractor || "");
                row = row.replace('{{description}}', issue.description || "");
                row = row.replace('{{unit}}', issue.unit_name || "");
                row = row.replace('{{area}}', issue.area_name || "");
                rows += row;
            });

            format = format.replace('{{date_signature}}', dateSignature);
            format = format.replace('{{companyImagePath}}', projectDetails.companyLogo);
            format = format.replace('{{projectName}}', projectDetails.projectName);
            format = format.replace('{{companyName}}', projectDetails.companyName);
            format = format.replace('{{units}}', projectDetails.units);
            format = format.replace('{{areas}}', projectDetails.areas);
            format = format.replace('{{rows}}', rows);

            format = format.replace('{{acceptance_report}}', res.__('Acceptance Report'));
            format = format.replace('{{project}}', res.__('Project'));
            format = format.replace('{{signature}}', res.__('Signature'));
            format = format.replace('{{contractor}}', res.__('Contractor'));
            format = format.replace('{{description}}', res.__('Description'));
            format = format.replace('{{area}}', res.__('Area'));
            format = format.replace('{{unit}}', res.__('Unit'));

            format = format.replace('{{accepted_by}}', res.__('Accepted By'));
            format = format.replace('{{quality_assurance}}', res.__('Quality Assurance'));
            format = format.replace('{{date}}', res.__('Date'));
            format = format.replace('{{date}}', res.__('Date'));
            format = format.replace('{{management}}', res.__('Management'));

            let newDateSignature = momentTimezone(dateSignature instanceof Date ? dateSignature.toISOString() : dateSignature).tz(timezone).format(REPORT_DATE_FORMAT);

            if (isNeededRow) {
                format = replaceall('{{showAreaColumn}}', "", format);
                format = replaceall('{{unitAndSignatureColumnWith}}', "50px", format);
            } else {
                format = replaceall('{{showAreaColumn}}', "display:none;", format);
                format = replaceall('{{unitAndSignatureColumnWith}}', "75px", format);
            }

            format = replaceall('{{dateSignature}}', newDateSignature, format);

            if (managerSignature) {
                format = replaceall('{{manager_signature}}', `https://${BUCKET_NAME}.s3.amazonaws.com/${managerSignature}`, format);
                format = replaceall('{{manager_signature_style}}', "", format);
            } else {
                format = replaceall('{{manager_signature_style}}', "display:none", format);
            }

            if (qaSignature) {
                format = format.replace('{{qa_signature_style}}', "");
                format = format.replace('{{qa_signature}}', `https://${BUCKET_NAME}.s3.amazonaws.com/${qaSignature}`);
            } else {
                format = format.replace('{{qa_signature_style}}', "display:none");
            }

            format = format.replace('{{userName}}', userName);

            return format;
        }
    };

    module.translateIfNeeded = function(issuesResult, language, autoTranslate, userId) {
        let issuesOriginalLanguageArray = [];
        let issuesOriginalLanguageDescriptions = [];

        let issuesToTranslate = [];
        let issuesDescriptionsToTranslate = [];

        return new Promise(function(resolve, reject) {
            issuesResult.forEach(function(issue) {
                // Collecting incorrect IDs of original language for issues
                if (usedLanguagesArray.indexOf(issue.attributes['original_language_id']) === -1) {
                    issuesOriginalLanguageArray.push(issue);
                    issuesOriginalLanguageDescriptions.push(issue.attributes.description);
                }
            });

            resolve();
        })
        .then(function() {
            // Defining IDs of issues original language
            if (issuesOriginalLanguageDescriptions.length) {
                return translationService.detectPromise(issuesOriginalLanguageDescriptions);
            } else {
                return [];
            }
        })
        .then(function(translations) {
            // Saving and returning original language ID for issues
            if (translations instanceof Array) {
                return translationService.setOriginalLanguage(issuesOriginalLanguageArray, translations, 'issues');
            } else if (translations instanceof Object) {
                return translationService.setOriginalLanguage(issuesOriginalLanguageArray, [translations], 'issues');
            }
        })
        .then(function() {
            issuesResult.map(function(issue) {
                // Collecting not translated issues
                if (autoTranslate && language !== issue.attributes['original_language_id']) {
                    if (issue.relations && issue.relations.translations && issue.relations.translations.length > 0) {
                        issue.attributes['description_' + language] = issue.relations.translations.models[0].attributes.description;
                    } else {
                        issuesToTranslate.push(issue);
                        issuesDescriptionsToTranslate.push(issue.attributes.description);
                    }
                }
            });

            return {};
        })
        .then(function() {
            // Translating issues
            if (issuesDescriptionsToTranslate.length) {
                return translationService.detectTranslate(issuesDescriptionsToTranslate, language);
            } else {
                return {};
            }
        })
        .then(function(translations) {
            // Saving and returning issue transltion
            if (translations instanceof Array) {
                return translationService.setTranslate(issuesToTranslate, translations, language, userId, 'issues_translation', 'issue_id');
            } else if (translations instanceof Object) {
                return translationService.setTranslate(issuesToTranslate, [translations], language, userId, 'issues_translation', 'issue_id');
            }
        })
        .then(function() {
            issuesResult.map(function(item) {
                if (item.attributes['description_' + language]) {
                    item.attributes.description = item.attributes['description_' + language];
                }
            });

            // Returning collection with translations
            return issuesResult;
        })
        .catch(function(err) {
            err.method = "acceptanceReportService - translateIfNeeded";
            err.userId = userId;
            return err;
        });
    };

    return module;
};