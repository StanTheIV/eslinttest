/* 'use strict';
// logging and Exception handling on top because of possible errors in modules which would otherwise not be caught
var Logging = require('../lib/logging.js');
var anbieter = 'mtel';

var runId = anbieter.replace(/[^0-9a-zA-z]/gi, '') + Date.now();
var Log = Logging.child({
	mainType: 'cron',
	cronType: anbieter,
	runId
});
var Cronitor = require('../lib/cronitor.js')('DIdGX8', runId);
process.on('uncaughtException', function (err) {
	Log.fatal(err, 'uncaughtException detected - cronjob is exiting unexpected');
	Cronitor.fail(err, (cErr) => {
		if (cErr) {
			Log.error(cErr);
		}
		process.exit(1);
	});
}); */
// please only change things below this line
const request = require('request');
const cheerio = require('cheerio');
// var jsdom = require('jsdom');
const fs = require('fs-extra');
const moment = require('moment');
const path = require('path');
const async = require('async');
/*
Log.debug('------------TESTING------------');
Log.debug('cronjob start');
Cronitor.run();*/

let START_URL = 'https://mtel.at/de/oec/products/productsList';
let pagesToVisit = [];
let ergebnis = [];
let tar = [];

async.series([prego, go]);

function prego (cb) {
	request('https://mtel.at/de/Tarife/Handytarife', function (error, response, body) {
		if (error) {
			return;
		}
		let $ = cheerio.load(body);
		let buf = [];
		$('.price-section').find('p').each((i, elem) => {
			buf.push(parseFloat($(elem).text().split(" ")[0].replace(",", ".")));
		});
		buf.sort();
		tar['servus-s'] = buf[0];
		tar['servus-m'] = buf[1];
		tar['servus-l'] = buf[2];
		cb();
	});
}

function go () {
	// Make the request
	request.post({
		method: 'POST',
		uri: START_URL,
		headers: {
			'X-Requested-With': 'XMLHttpRequest'
		},
		form: {
			bundle_id: 'xROGtVE68h25g4uHHrmrrg',
			simple_list_alias: 'servus-tarife-uredjaji',
			items: '30',
			page: '1',
			offset: '0',
			product_subtype: 'mobile-phone'
		}
	}, function (error, response, body) {
		// Check status code (200 is HTTP OK)
		// console.log('Status code: ' + response.statusCode);
		if (error || response.statusCode !== 200) {
			// Log.debug('Request-Error: ' + response.statusMessage);
			return;
		}

		collectInternalLinks(body);

		crawl(finish);
	});
}


function collectInternalLinks (body) {
	// Log.debug("Collecting Device URLs");
	let count = 0;
	JSON.parse(body).data.devices.forEach((device) => {
		if (count < 2) {
			pagesToVisit.push({
				handy: device.alias
			});
			pagesToVisit[count]['tarife'] = [];
			pagesToVisit[count]['tarife'].push(device.url.replace('servus-m', 'servus-s'));
			pagesToVisit[count]['tarife'].push(device.url);
			pagesToVisit[count]['tarife'].push(device.url.replace('servus-m', 'servus-l'));
			count++;
		}
	});
	// console.log(pagesToVisit.length + ' Links collected');
}

function crawl (callback) {
	/* Log.debug("Crawling through devices"); */
	let device = pagesToVisit.pop();
	async.mapSeries(device.tarife, getPriceForPlan, callback.bind(device));
}

function getPriceForPlan (tarifurl, cb) {
	request(tarifurl, function (error, response, body) {
		if (error) {
			cb(error, null);
		} else {
			let $ = cheerio.load(body);
			let tarifname = tarifurl.slice(tarifurl.lastIndexOf("servus-"), tarifurl.lastIndexOf("servus-") + 8);
			return cb(null, {
				"handy_preis": parseFloat($('.value').text().replace(",", ".")) - (tar[tarifname]),
				"tarif": tarifname
			});
		}
	});
}

function finish (err, result) {
	if (err) {
		/* Log.error(err);
		Cronitor.fail(err, (cErr) => {
			if (cErr) {
				Log.error(cErr);
			}
		}); */
	} else {
		ergebnis.push({
			'handy': this.handy,
			'res': result
		});

		if (pagesToVisit.length > 0) {
			setTimeout(crawl, 1000);
			console.log(pagesToVisit.length + " to go");
		} else {
			let now = moment();
			// Log.debug('Trying to write JSON');
			let dir = path.join(__dirname, '/res/mtel/');
			fs.writeFile(path.join(dir, 'mtel-' + now.format('YYYY-MM-DD') + '.json'), JSON.stringify(ergebnis));


			/* 			Cronitor.complete('', (cErr) => {
				if (cErr) {
					Log.error(cErr);
				} else {
					Log.debug('cronjob done');
				}
			}); */
		}
	}
}
