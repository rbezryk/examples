const serviceAccount = require("./serviceAccountKey.test.json");
const rp = require('request-promise');
const moment = require('moment');
const _ = require('lodash');
const faker = require('faker');

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://line-onechat.firebaseio.com/',
});
const firebase = admin.database();

const settings = require('./settings');
const facebookUri = settings.urls.facebook_uri;

const models = require('models').models;
const Page = models.fbPage;
const FirebaseUser = models.firebaseUser;
const Rules = models.categorizeDialogRules;
const User = models.userProfile;
const Promise = require('bluebird');
const mongoose = require('mongoose');

mongoose.Promise = Promise;
mongoose.connect(settings.urls.database, {
  socketTimeoutMS: 0,
  connectTimeoutMS: 0,
  useCreateIndex: true,
  useNewUrlParser: true,
});
// mongoose.set('debug', true);

const ApiBuilder = require('claudia-api-builder');
const api = new ApiBuilder();

api.post('/add/notreplied/comment', addNotRepliedComment);
api.post('/add/notreplied/message', addNotRepliedMessage);
api.post('/add/replied/comment', addRepliedComment);
api.post('/add/replied/message', addRepliedMessage);
api.post('/add-comment', addCommentToFirebase);
api.post('/add-message', addMessageToFirebase);
api.post('/add-post', addPostToFirebase);

module.exports = api;

let templateComment = {
  dashboard_user_id: "",
  page_id: "",
  sender_id: "",
  comment_id: "",
  message_text: "",
  post_id: "",
  timestamp: "",
};

let templateMessage = {
  dashboard_user_id: "",
  page_id: "",
  sender_id: "",
  message_id: "",
  message_text: "",
  recipient_id: "",
  timestamp: "",
};

/**
* The endpoint for adding the unreplied comments into Firebase DB
* @param {string} dashboard_user_id - ID user dashboard
* @param {string} page_id - ID facebook page
* @param {string} sender_id - subscriber ID
* @param {string} comment_id - ID of the comment that the subscriber sent
* @param {string} message_text - the message that the subscriber sent
* @param {string} post_id - ID post to which the comment was made
* @param {number} timestamp - unix timestamp when subscriber sent message
* @returns {object} {status: (boolean), error: (null | error message)}
*/
async function addNotRepliedComment(req) {
  try {
    if (!req.body.dashboard_user_id) {
      throw new Error('Missing fields: dashboard_user_id');
    }

    await addUserToSystem(req.body.dashboard_user_id);
    let standartData = await addStandartDataToFirebase(templateComment, req.body, 'comments', 'notreplied');
    await countingDataOnFirebase('comments', 'notreplied', standartData.small);

    return { status: true, error: null };
  } catch (err) {
    console.error('=== Error: Not Replied Comment ===');
    console.error(err)

    return { status: false, error: err.message };
  }
}

/**
* The endpoint for adding the unreplied messages into Firebase DB
* @param {string} dashboard_user_id - ID user dashboard
* @param {string} page_id - ID facebook page
* @param {string} sender_id - subscriber ID
* @param {string} message_id - ID of the message that the subscriber sent
* @param {string} message_text - the message that the subscriber sent
* @param {string} recipient_id - ID of the recipient who received the message
* @param {number} timestamp - unix timestamp when subscriber sent message
* @returns {object} {status: (boolean), error: (null | error message)}
*/
async function addNotRepliedMessage (req) {
  try {
    if (!req.body.dashboard_user_id) {
      throw new Error('Missing fields: dashboard_user_id');
    }

    await addUserToSystem(req.body.dashboard_user_id);
    let standartData = await addStandartDataToFirebase(templateMessage, req.body, 'messages', 'notreplied');
    await countingDataOnFirebase('messages', 'notreplied', standartData.small);

    return { status: true, error: null };
  } catch (err) {
    console.error('=== Error: Not Replied Messages ===');
    console.error(err)

    return { status: false, error: err.message };
  }
}

/**
* The endpoint for adding a comment (that was replied to) into Firebase DB
* @param {string} dashboard_user_id - ID user dashboard
* @param {string} page_id - ID facebook page
* @param {string} sender_id - subscriber ID
* @param {string} comment_id - ID of the comment that the subscriber sent
* @param {string} message_text - the message that the subscriber sent
* @param {string} post_id - ID post to which the comment was made
* @param {number} timestamp - unix timestamp when subscriber sent message
* @returns {object} {status: (boolean), error: (null | error message)}
*/
async function addRepliedComment(req) {
  try {
    if (!req.body.dashboard_user_id) {
      throw new Error('Missing fields: dashboard_user_id');
    }

    await addUserToSystem(req.body.dashboard_user_id);
    let standartData = await addStandartDataToFirebase(templateComment, req.body, 'comments', 'replied');
    await countingDataOnFirebase('comments', 'replied', standartData.small);

    return { status: true, error: null };
  } catch (err) {
    console.error('=== Error: Replied Comment ===');
    console.error(err)

    return { status: false, error: err.message };
  }
}

/**
* The endpoint for adding a message (that was replied to) into Firebase DB
* @param {string} dashboard_user_id - ID user dashboard
* @param {string} page_id - ID facebook page
* @param {string} sender_id - subscriber ID
* @param {string} message_id - ID of the message that the subscriber sent
* @param {string} message_text - the message that the subscriber sent
* @param {string} recipient_id - ID of the recipient who received the message
* @param {number} timestamp - unix timestamp when subscriber sent message
* @returns {object} {status: (boolean), error: (null | error message)}
*/
async function addRepliedMessage (req) {
  try {
    if (!req.body.dashboard_user_id) {
      throw new Error('Missing fields: dashboard_user_id');
    }

    await addUserToSystem(req.body.dashboard_user_id);
    let standartData = await addStandartDataToFirebase(templateMessage, req.body, 'messages', 'replied');
    await countingDataOnFirebase('messages', 'replied', standartData.small);

    return { status: true, error: null };
  } catch (err) {
    console.error('=== Error: Replied Messages ===');
    console.error(err)

    return { status: false, error: err.message };
  }
}

/**
* The endpoint for adding the comments into Firebase DB
* @param {string} dashboard_user_id - ID user dashboard
* @param {string} page_id - ID facebook page
* @param {string} sender_id - subscriber ID
* @param {string} comment_id - ID of the comment that the subscriber sent
* @param {string} message_text - the message that the subscriber sent
* @param {string} post_id - ID post to which the comment was made
* @param {number} timestamp - unix timestamp when subscriber sent message
* @returns {object} {status: (boolean), error: (null | error message)}
*/
async function addCommentToFirebase(req) {
  try {
    if (!req.body.dashboard_user_id) {
      throw new Error('Missing fields: dashboard_user_id');
    }

    await addUserToSystem(req.body.dashboard_user_id);
    let standartData = await addStandartDataToFirebase(templateComment, req.body, 'comments', 'all');
    await addCommentsToSubscriber(standartData.messageData, standartData.dashboardUser);
    await countingDataByDayOnFirebase('comments', standartData.small);

    return { status: true, error: null };
  } catch (err) {
    console.error('=== Error: Add Comment ===');
    console.error(err)

    return { status: false, error: err.message };
  }
}

/**
* The endpoint for getting a list of subscribers from messages by criterion or without it
* @param {string} dashboard_user_id - post body, id user dashboard
* @param {string} page_id - post body, id page
* @param {string} sender_id - post body, id subscriber
* @param {string} message_id - post body, Facebook message id
* @param {string} message_text - post body, the message that the subscriber sent
* @param {string} recipient_id - post body, message recipient id
* @param {string} timestamp - post body, time to add message to unix timestamp
* @returns {object} {status: (boolean), error: (null|error message)}
*/
async function addMessageToFirebase (req) {
  try {
    let templateData = {
      dashboard_user_id: "",
      page_id: "",
      sender_id: "",
      message_id: "",
      message_text: "",
      recipient_id: "",
      timestamp: "",
    };

    let checkData = _.difference(_.keys(templateData), _.keys(req.body));

    if (checkData && checkData.length) {
      return { status: false, error: `Missing fields: ${checkData.join(', ')}` };
    }

    let subscriberData = null;
    let dashboardUser = null;
    let dashboardUserId = req.body.dashboard_user_id;
    let data = {
      page_id: req.body.page_id,
      sender_id: req.body.sender_id,
      message_id: req.body.message_id,
      message_text: req.body.message_text,
      recipient_id: req.body.recipient_id,
      timestamp: +req.body.timestamp,
      timestamp_desc: -req.body.timestamp,
      post_time: moment(new Date(+req.body.timestamp)).format('MM/DD/YYYY HH:mm:ss'),
    };
    let saveDay = moment(new Date(+req.body.timestamp * 1000)).format('DD-MM-YYYY');
    let requestOptions = {
      method: 'GET',
      json: true,
      uri: '',
    };
    let requestData = null;
    let pageData = null;
    let countingData = {};
    let addSubscriberResult = null;

    await addUserToSystem(dashboardUserId);

    dashboardUser = await FirebaseUser.findOne({ dashboard_id: dashboardUserId });
    if (!dashboardUser) {
      return { status: false, error: 'Dashboard user not found.' };
    }

    pageData = await Page.findOne({ page_id: data.page_id });
    if (!pageData) {
      return { status: false, error: 'Page not found.' };
    }

    requestOptions.uri = facebookUri.replace('<PAGE_ACCESS_TOKEN>', pageData.page_access_token).replace('<PSID>', data.sender_id);
    requestData = await rp(requestOptions);
    subscriberData = Object.assign(data, requestData);
    countingData = {
      uid: dashboardUser.firebase_uid,
      page_id: subscriberData.page_id,
      timestamp: subscriberData.timestamp,
    };

    await firebase
      .ref(`/facebook-new`)
      .child(dashboardUser.firebase_uid)
      .child(subscriberData.page_id)
      .child('days')
      .child(saveDay)
      .child('messages')
      .child('all')
      .push(subscriberData)

    await countingDataByDayOnFirebase('messages', countingData);
    addSubscriberResult = await addNewSubscriber(subscriberData, dashboardUser);

    if (addSubscriberResult) {
      await countingDataByDayOnFirebase('subscribers', countingData);
    }

    await addMessagesToSubscriber(subscriberData, dashboardUser);
    await addMessagesToRules(subscriberData, dashboardUser);

    return { status: true, error: null };
  } catch (err) {
    console.error('=== Error: Add Message ===');
    console.error(err)

    return { status: false, error: err };
  }
};

async function addNewSubscriber(messageData, dashboardUser) {
  let subscriber = {
    id: messageData.id,
    psid: messageData.id,
    first_name: messageData.first_name,
    last_name: messageData.last_name,
    gender: "",
    profile_pic: messageData.profile_pic,
    comment_id: messageData.comment_id || null,
    message_id: messageData.message_id || null,
    message: messageData.message_text,
    timestamp: messageData.timestamp,
    timestamp_desc: messageData.timestamp_desc,
  };
  let saveDay = moment(new Date(+messageData.timestamp * 1000)).format('DD-MM-YYYY');

  let checkSubscriber = await firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(messageData.page_id)
    .child('subscribers')
    .child('all')
    .orderByChild('psid')
    .equalTo(subscriber.id)
    .once('value')

  if (checkSubscriber.exists()) {
    return null;
  }

  await firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(messageData.page_id)
    .child('subscribers')
    .child('all')
    .push(subscriber);

  return firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(messageData.page_id)
    .child('days')
    .child(saveDay)
    .child('subscribers')
    .child('all')
    .push(subscriber)
    .then(() => {
      return {
        uid: dashboardUser.firebase_uid,
        page_id: messageData.page_id,
        timestamp: messageData.timestamp,
      }
    });
}

function addCommentsToSubscriber(commetData, dashboardUser) {
  let saveDay = moment(new Date(+commetData.timestamp * 1000)).format('DD-MM-YYYY');

  return firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(commetData.page_id)
    .child('days')
    .child(saveDay)
    .child('comments')
    .child('subscribers')
    .child(commetData.id)
    .push(commetData)
}

function addMessagesToSubscriber(messageData, dashboardUser) {
  let saveDay = moment(new Date(+messageData.timestamp * 1000)).format('DD-MM-YYYY');

  return firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(messageData.page_id)
    .child('days')
    .child(saveDay)
    .child('messages')
    .child('subscribers')
    .child(messageData.id)
    .push(messageData)
}

function addMessagesToRules(messageData, dashboardUser) {
  return Rules.find({}).then(rules => {
    let regExp;
    let rulesArray = [];

    rules.forEach(item => {
      item.RegExp.forEach(exp => {
        regExp = new RegExp(exp.pattern, exp.flags);

        if (regExp.test(messageData.message_text)) {
          rulesArray.push(item.Name.toLowerCase());
        }
      });
    });

    return rulesArray;
  })
  .each(ruleName => {
    let saveDay = moment(new Date(+messageData.timestamp * 1000)).format('DD-MM-YYYY');

    return firebase
      .ref(`/facebook-new`)
      .child(dashboardUser.firebase_uid)
      .child(messageData.page_id)
      .child('days')
      .child(saveDay)
      .child('messages')
      .child('rules')
      .child(ruleName)
      .push(messageData)
  });
}

/**
* The endpoint for adding posts to Firebase DB
* @param {string} dashboard_user_id - post body, id user dashboard
* @param {string} page_id - post body,
* @param {string} post_id - post body,
* @param {string} page_name - post body,
* @param {string} page_image_url - post body,
* @param {string} post_image_url - post body,
* @param {boolean} post_ignore - post body,
* @param {string} message_text - post body,
* @param {string} timestamp - post body,
* @returns {object} {status: (boolean), error: (null|error message)}
*/
async function addPostToFirebase (req) {
  let templateData = {
    dashboard_user_id: "",
    page_id: "",
    post_id: "",
    page_name: "",
    page_image_url: "",
    post_image_url: "",
    post_ignore: "",
    message_text: "",
    timestamp: "",
  };

  let checkData = _.difference(_.keys(templateData), _.keys(req.body));

  if (checkData && checkData.length) {
    return { status: false, error: `Missing fields: ${checkData.join(', ')}` };
  }

  let dashboardUser = null;
  let dashboardUserId = req.body.dashboard_user_id;
  let data = {
    page_id: req.body.page_id,
    post_id: req.body.post_id,
    page_name: req.body.page_name,
    page_image_url: req.body.page_image_url,
    post_image_url: req.body.post_image_url,
    post_ignore: req.body.post_ignore,
    message_text: req.body.message_text,
    timestamp: +req.body.timestamp,
    post_time: moment(new Date(+req.body.timestamp * 1000)).format('MM/DD/YYYY HH:mm:ss'),
  };
  let saveDay = moment(new Date(+req.body.timestamp * 1000)).format('DD-MM-YYYY');

  dashboardUser = await FirebaseUser.findOne({ dashboard_id: dashboardUserId });
  if (!dashboardUser) {
    return { status: false, error: 'Dashboard user not found.' };
  }

  await firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(data.page_id)
    .child('days')
    .child(saveDay)
    .child('posts')
    .child('all')
    .push(data)

  await firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(data.page_id)
    .child('posts')
    .child('all')
    .push(data)

  return { status: true, error: null };
}

async function addStandartDataToFirebase(template, body, section, type) {
  // Check if all fields are present in the body according to the template
  let checkData = _.difference(_.keys(template), _.keys(body));

  if (checkData && checkData.length) {
    throw new Error(`Missing fields: ${checkData.join(', ')}`);
  }

  // Declare variable and fill it
  let userId = body.dashboard_user_id;
  let data = {};
  let dashboardUser = null;
  let subscriber = {};
  let facebookPage = null;
  let requestOptions = {
    method: 'GET',
    json: true,
    uri: '',
  };
  let saveDay = moment(new Date(+body.timestamp * 1000)).format('DD-MM-YYYY');

  for (let index in template) {
    if (index != 'dashboard_user_id') {
      data[index] = body[index];
    }
  }

  data.timestamp = +data.timestamp;
  data.timestamp_desc = -data.timestamp;
  data.post_time = moment(new Date(data.timestamp * 1000)).format('MM/DD/YYYY HH:mm:ss');

  // Get UID of user in Firebase
  dashboardUser = await FirebaseUser.findOne({ dashboard_id: userId });

  if (!dashboardUser) {
    throw new Error('Dashboard user not found.');
  }

  // Get access token to the page to get the data about subscriber
  facebookPage = await Page.findOne({ page_id: data.page_id });

  if (!facebookPage) {
    throw new Error('Page not found.');
  }

  // Generate a request to get the data about subscriber
  requestOptions.uri = facebookUri.replace('<PAGE_ACCESS_TOKEN>', facebookPage.page_access_token).replace('<PSID>', data.sender_id);

  try {
    // Subscriber's data
    subscriber = await rp(requestOptions);
  } catch(e) {
    console.log('Failed to fetch subscriber info of sender_id:');
    console.log(data);
    console.log(e);
  }

  let returnData = {
    small: {
      dashboard_user_id: body.dashboard_user_id,
      uid: dashboardUser.firebase_uid,
      page_id: facebookPage.page_id,
      timestamp: data.timestamp
    },
    messageData: Object.assign(data, subscriber),
    dashboardUser: {
      firebase_uid: dashboardUser.firebase_uid,
    }
  };

  // Add the data into Firebase
  return firebase
    .ref(`/facebook-new`)
    .child(dashboardUser.firebase_uid)
    .child(facebookPage.page_id)
    .child('days')
    .child(saveDay)
    .child(section)
    .child(type)
    .push(returnData.messageData)
    .then(() => returnData);
}

async function countingDataOnFirebase(section, path, data) {
  let firebaseCounter = null;
  let pathCounter = null;

  pathCounter = `/facebook-new/${data.uid}/${data.page_id}/counters/${section}/${path}`;

  firebaseCounter = await firebase.ref(pathCounter).once('value');

  if (firebaseCounter.val() === null) {
    return await firebase.ref(pathCounter).set(1);
  } else {
    return await firebase.ref(pathCounter).set(firebaseCounter.val() + 1);
  }
}

async function countingDataByDayOnFirebase(section, data) {
  let day = moment(new Date(+data.timestamp)).format('DD-MM-YYYY');
  if (section == "comments") {
    day = moment(new Date(+data.timestamp * 1000)).format('DD-MM-YYYY');
  }

  let firebaseTotalCounter = null;
  let pathTotalCounter = null;
  let firebaseDayCounter = null;
  let pathDayCounter = null;

  pathTotalCounter = `/facebook-new/${data.uid}/${data.page_id}/counters/${section}/total`;
  pathDayCounter = `/facebook-new/${data.uid}/${data.page_id}/counters/${section}/days/${day}`;

  firebaseTotalCounter = await firebase.ref(pathTotalCounter).once('value');

  if (firebaseTotalCounter.val() === null) {
    await firebase.ref(pathTotalCounter).set(1);
  } else {
    await firebase.ref(pathTotalCounter).set(firebaseTotalCounter.val() + 1);
  }

  firebaseDayCounter = await firebase.ref(pathDayCounter).once('value');

  if (firebaseDayCounter.val() === null) {
    return await firebase.ref(pathDayCounter).set(1);
  } else {
    return await firebase.ref(pathDayCounter).set(firebaseDayCounter.val() + 1);
  }
}

async function addUserToSystem(userId) {
  let dashboardUser = null;
  let userData = null;
  let firebaseUser = null;
  let userMongo = {
    dashboard_id: userId,
    firebase_uid: null,
    email: null,
    display_name: null,
    password: null,
  };

  dashboardUser = await FirebaseUser.findOne({ dashboard_id: userId });

  if (dashboardUser) {
    return true;
  }

  userData = await generateFirebaseUserData();

  userMongo.email = userData.email;
  userMongo.display_name = userData.displayName;
  userMongo.password = userData.password;

  firebaseUser = await admin.auth().createUser(userData);

  userMongo.firebase_uid = firebaseUser.uid;

  await FirebaseUser.create(userMongo);

  return true;
}

function generateFirebaseUserData() {
  let userFirebase = {
		email: faker.internet.email(),
		emailVerified: true,
		password: faker.internet.password(),
		displayName: faker.name.findName(),
		photoURL: "http://www.mockup.com/12345678/photo.png",
		disabled: false,
  };

  return admin.auth().getUserByEmail(userFirebase.email).then(userData => {
    return generateFirebaseUserData();
  })
  .catch(() => {
    return userFirebase;
  });
}
