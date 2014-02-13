
/*
 *
 
 FBOpen API server v0

 Supports /opp ("opportunity") POST and GET
 and POSTing a new/updated set of tags for an opportunity

 *
 */

var express = require('express')

	// express.js standard scaffolding components (some overkill here)
	, routes = require('./routes')
	, http = require('http')
	, https = require('https')
	, path = require('path')
	, http_auth = require('http-auth')

	// other useful stuff
	, request = require('request')
	, qs = require('querystring')
	, es = require('elasticsearch')
	, url = require('url')
	, moment = require('moment') // momentjs.com
	, S = require('string') // stringjs.com
    , util = require('util')
	;

var config = require('./config');

var app = express();

// http basic auth, if required in config
if (config.app.require_http_basic_auth) {
	var basic = http_auth.basic(config.app.http_basic_auth);
	app.use(http_auth.connect(basic));
}

// Create Solr client
var client = es.Client({
    host: 'localhost:9200',
    log: 'trace'
});

// all environments
// (express.js standard scaffolding -- see http://expressjs.com/guide.html#executable )
// some of this is unused/overkill at the moment
// app.set('port', config.app.port);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(app.router);
app.use(require('less-middleware')({ src: __dirname + '/public' }));
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// Allow cross-site queries (CORS)
app.get('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

app.options('*', function(req, res) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Requested-With, X-Prototype-Version, Authorization',
    'Content-Type': 'application/json;charset=utf-8'
  });
  res.send('supported options: GET, OPTIONS [non-CORS]');
});


app.get('/v0/', function(req, res) {
	res.send('FBOpen APi v0. See http://docs.fbopen.apiary.io for initial documentation.');
});

app.get('/v0/hello', function(req, res){
    client.ping({
        requestTimeout: 10000,
        hello: "elasticsearch!"
    }, function (error) {
        if (error) {
            res.send('elasticsearch cluster is down!');
        } else {
            res.send('All is well');
        }
    });
});



// Queries
app.get('/v0/opps', function(req, res) {

	// execute the Elasticsearch query and return results

	var url_parts = url.parse(req.url, true);

	var q_param = '';
	var q = url_parts.query['q'];
	if (q != undefined) {
		q_param = '&q=+' + q;
	}

	// allow adding fq params
	var fq_param = '';
	var fq = url_parts.query['fq'];
	if (fq && fq != '') fq_param = '&fq=' + fq;

	// //
	// // special fields
	// //

    // // omit or include non-competed listings
	// if (!url_parts.query['show_noncompeted'] || url_parts.query['show_noncompeted'] != 'true') {
	// 	q_param += ' -"single source" -"sole source" -"other than full and open competition"';
	// }

	// // omit or include closed listings
    // if (!url_parts.query['show_closed'] || url_parts.query['show_closed'] != 'true') {
	// 	var param_phrase = 'close_dt:[NOW/DAY%20TO%20*]';
	// 	if (q_param != '') {
	// 		fq_param = fq_param + '&fq=' + param_phrase;
	// 	} else {
	// 		q_param = '&q=' + param_phrase;
	// 	}
	// }

	// // filter by data source
	// var data_source = url_parts.query['data_source'];
	// if (data_source != undefined && data_source != '') {
	// 	if (q_param != '') {
	// 		fq_param = fq_param + '&fq=data_source:' + data_source;
	// 	} else {
	// 		q_param = '&q=data_source:' + data_source;
	// 	}
	// }

	// var misc_params = '';
	// // special case: request only the parent of a specific document
	// // (for quickly pulling information about an attachment's parent solicitation)
	// if (url_parts.query['get_parent'] && url_parts.query['solnbr']) {
	// 	misc_params += '&get_parent=true&solnbr=' + url_parts.query['solnbr'];
	// }

	// // pagination
	// if (url_parts.query['start']) {
	// 	misc_params += '&start=' + url_parts.query['start'];
	// }

	// // let caller trim down which fields are returned
	// // (TO DO: allow for other (all?) non-default params)
	// var fieldlist;
	// if (url_parts.query['fl']) {
	// 	fieldlist = url_parts.query['fl'];
	// } else {
	// 	fieldlist = '*,score';
	// }

	// var solnbr = url_parts.query['solnbr'] || '';

	// if (url_parts.query['get_parent']) { // special request only for a parent url:
	// 	solr_url += '?wt=json&fl=id,solnbr,title,listing_url&fq=solnbr:' + solnbr + '&q=listing_url:*';
	// } else { // standard query
	// 	solr_url += '?wt=json&facet=true&facet.field=FBO_NAICS&facet.field=data_source'
	// 	+ '&defType=edismax'
	// 	+ '&fl='+ fieldlist
	// 	+ '&hl=true&hl.fl=description,content,summary&hl.fragsize=150&hl.mergeContiguous=true&hl.usePhraseHighlighter=true&hl.snippets=3&hl.simple.pre=<highlight>&hl.simple.post=</highlight>'
	// 	+ fq_param
	// 	+ q_param
	// 	+ misc_params;
	// }

	// console.log('solr_url = ' + solr_url);

    var search = {};

    //if (fq) {
    //    var filter = {
    //        query : {
    //            match : { _all : fq }
    //        }
    //    }
    //}

    client.search({
        index: 'fbopen',
        type: 'opp',
        body: {
            highlight : {
                pre_tags: ["<highlight>"],
                post_tags: ["</highlight>"],
                fields : {
                    "description" : {},
                    "FBO_OFFADD" : {}
                }
            },
            query: { 
                filtered : {
                    query: {
                        bool: {
                            should : [
                                { match : { "_all" : q } },
                                { has_child : { 
                                    type : "opp_attachment", 
                                    query : { 
                                        term : { _all : q } 
                                    } 
                                } }
                            ]
                        }
                    }
                },
                filter : {
                    query : {
                        match : { _all : fq }
                    }
                }
            },
            aggs : {
                naics_code : {
                    terms : { field : "FBO_NAICS" }
                },
                data_source : {
                    terms : { field : "data_source" }
                }
            }
        }
    }, function (err, body) {
        if (err) {
            res.send(err);
            return;
        }

        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', 'application/json;charset=utf-8');

        if (!err && res.statusCode == 200) {

            //res.send(body);
            //return;

            // massage results into the format we want
            var results_out = {};
            results_out.docs = [];

            console.log(util.inspect(body));
            results_out.facets = body.aggregations;
            console.log(util.inspect(results_out.facets));
            // console.dir(results_out.facets);

            // map facet_fields from [label1, value1, label2, value2 ...]
            // to label1: value1, label2: value2, etc.
            //var facet;
            //for (facet_field_name in results_in.facet_counts.facet_fields) {
            //    facet = results_in.facet_counts.facet_fields[facet_field_name];
            //    results_out.facets[facet_field_name] = flat_list_to_json(facet);
            //}

            // map highlights to into docs, instead of separate data,
            // and do a few other cleanup manipulations
            var doc_out, doc_id;
            for (doc_idx in body.hits.hits) {
                // console.log(util.inspect(doc));

                doc_out = body.hits.hits[doc_idx];
                doc_id = doc_out.id;

                // adjust score to 0-100
                doc_out.score = Math.min(Math.round(doc_out.score * 100), 100);

                // clean up fields
                doc_out.data_source = doc_out.data_source || '';
                if (doc_out.FBO_SETASIDE == 'N/A') doc_out.FBO_SETASIDE = '';

                // type-specific changes, until we've normalized the data import
                if (doc_out.FBO_CONTACT != '') doc_out.contact = doc_out.FBO_CONTACT;
                if (doc_out.AgencyContact_t != '') doc_out.contact = doc_out.AgencyContact_t;
                results_out['docs'].push(doc_out);
            }

            res.json(200, results_out);
            // res.json(200, JSON.parse(body));
            // res.send(body);
        } else {
            res.json(res.statusCode, { error: err });
        }
    });
});


// Allow POST operations only according to configuration
app.post('*', function(req, res, next) {
	if (config.app.read_only) {
		res.send(405);
	} else {
	  next();
	}
});

//// new opportunity POSTed
//app.post('/v0/opp', function(req, res) {
//
//	// console.log('request = ' + req.originalUrl);
//
//	// validate the POSTed data and then add it to the Solr index
//
//	// POSTed data should include at least the following required fields:
//	// data_source  "FBO", "grants.gov", "SBIR", etc.
//	// solnbr       (solicitation number, unique per data_source)
//	// listing_url  outbound link to the source or agency's page for this project
//	// title        title of solicitation
//	// close_dt     Close Date
//
//	return_data = {};
//	return_message = '';
//	omitted_fields = [];
//
//	if (has_required_fields(req)) {
//
//		solr_doc = req.body;
//		// console.log('solr_doc = ' + JSON.stringify(solr_doc));
//
//		// convert date to proper format
//		for (field in solr_doc) {
//
//			// handle date fields
//			if (S(field).endsWith('_dt') || S(field).endsWith('DATE')) {
//				// console.log('converting date ' + field + ' = ' + solr_doc[field] + ' ...');
//				dt_in = solr_doc[field];
//				solr_doc[field] = solrize_date(dt_in);
//			}
//
//			// filter out certain standard-but-unwanted-for-now fields
//			if (field == 'utf8' || field == 'commit') {
//				delete solr_doc[field];
//				omitted_fields.push(field);
//			}
//		}
//
//		if (omitted_fields.length > 0) return_data.omitted_fields = omitted_fields;
//
//		// create unique (?) Solr ID for this record
//		solr_doc.id = solr_doc.data_source + ':' + solr_doc.solnbr;
//		solr_doc.data_type = 'opp';
//		return_data.id = solr_doc.id;
//
//		client.add(solr_doc, function(err, obj) {
//			if (err) {
//				// console.log(err);
//				fail = {
//					'status': 'fail'
//					, 'message': 'client.add failed: ' + err
//				}
//				res.send(400, fail);
//			} else {
//				// console.log('added: ' + JSON.stringify(obj));
//				success = {
//					'status': 'success'
//					, 'message': 'Ok'
//					, 'data': return_data
//				}
//				res.send(success);
//			}
//		});
//	} else {
//		fail = {
//			'status': 'fail'
//			, 'message': 'missing one or more required fields'
//		}
//		res.send(400, fail);
//	}
//});

// function solrize_date(date_string) {
// 	dt = moment(date_string);
// 	if (dt.isValid()) {
// 		dt_out = dt.format('YYYY-MM-DD[T]HH:mm:ss[Z]');
// 		return dt_out;
// 	} else {
// 		console.log('momentjs could not convert [' + dt + '] into a date.');
// 		return false;
// 	}
// }
// 
// // to add: much better validation
// // e.g., https://github.com/ctavan/express-validator
// function has_required_fields(req) {
// 	return (req.body.data_source 
// 		&& req.body.solnbr
// 		&& req.body.listing_url
// 		&& req.body.title
// 		&& req.body.close_dt 
// 	);
// }


// Tagging

app.post('/v0/opp/:doc_id/tags/:tags?', function(req, res) {

	// 'opp/' + solnbr + '/tags/' + tags_serial
	doc_id = req.params.doc_id;
	
	solr_doc = { 'id': doc_id }

	tags = req.params.tags;
	if (tags != undefined) {
		// console.log('tags.length = ' + tags.length);
		tags_array = tags.split(',');
		content_tags_array = [];
		content_tags_list = '{"set": ["' + tags_array.join('","') + '"]}';
	} else {
		content_tags_list = '{"set": [""]}';
	}

	// console.log('content_tags_list = ' + content_tags_list);
	solr_doc['content_tags'] = JSON.parse(content_tags_list);

	docs = [];
	docs.push(solr_doc);

	client.update(docs, function(err, obj) {
		if (err) {
			// console.log(err);
			fail = {
				'status': 'fail'
				, 'message': 'client.UPDATE failed: ' + err
			}
			res.send(fail);
		} else {
			// console.log('updated: ' + JSON.stringify(obj));
			success = {
				'status': 'success'
				, 'message': 'Ok'
				, 'data': doc_id
			}
			res.send(success);
		}
	});
});


if (config.app.listen_http) {
	http.createServer(app).listen(config.app.port);
}

if (config.app.listen_https) {
	https.createServer(config.ssl, app).listen(config.ssl.port);
}
