var express = require('express');
var mysql = require('mysql');
var async = require('async');
var bodyParser = require('body-parser');
var config = require('./config').production;
var fs = require('graceful-fs');

var app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(bodyParser.raw({
  type: 'image/png',
  limit: '1mb'
}));

var con = mysql.createConnection({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password,
    database: config.database.db
});

con.connect(function(err){
   if(err){
       console.log("Error connection to database: " + err)
   }else{
       console.log("Connected to database.")
   }
});

var server = app.listen(8081, function () {
   var host = server.address().address;
   var port = server.address().port;
   console.log("Example app listening at http://%s:%s", host, port);
});

app.get('/api/v1/creatures', function (req, res) {
    con.query(
        "SELECT c.moniker, n.name, c.genus, c.gender " +
        "FROM Creatures AS c " +
        "LEFT JOIN Names AS n " +
        "ON n.moniker = c.moniker " +
        "ORDER BY RAND() " +
        "LIMIT 12 ",
        [req.params.moniker],
        function(err, result, fields){
           if (err) throw err;
           result = result.sort(function(a, b){return a.birthdate-b.birthdate});
           res.setHeader('Access-Control-Allow-Origin', '*');
           res.write(JSON.stringify(result));
           res.end();
        });
});

app.get('/api/v1/creatures/:moniker', function (req, res) {
    con.query(
        "SELECT c.moniker, n.name, c.genus, c.gender " +
        "FROM Creatures AS c " +
        "LEFT JOIN Names AS n " +
        "ON n.moniker = c.moniker " +
        "WHERE c.moniker = ?",
        [req.params.moniker],
        function(err, results, fields){
            if (err) throw err;
            var creature = results[0];
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify(creature));
        });
});
app.put('/api/v1/creatures/:moniker', function (req, res) {
    var moniker = req.params.moniker;
    var creature = req.body;
    
    var eventsForTable = creature.events
        .map( (event) => {return [
                   moniker,
                   event.eventNumber,
                   event.histEventType,
                   event.lifeStage,
                   event.photo,
                   event.moniker1,
                   event.moniker2,
                   event.timeUtc,
                   event.tickAge,
                   event.worldTick,
                   event.worldName,
                   event.worldId,
        ];});
    
    var utxtsForTable = creature.events
        .filter((event) => {return event.utxt !== ""})
        .map((event) => {return [moniker, event.eventNumber, event.worldId, event.utxt, 0]});
    
    var children = creature.events
        .filter((event) => { return event.histEventType === 8 || event.histEventType === 9; })
        .map((event) => { return [
            moniker,
            event.moniker1
        ];});

    async.series([
        function(callback){
            con.query(
                "INSERT IGNORE INTO Creatures " +
                "(moniker, crossoverPointMutations, pointMutations, gender, genus) " +
                "VALUES ? ",
                [[[
                    moniker,
                    creature.crossoverPointMutations,
                    creature.pointMutations,
                    creature.gender,
                    creature.genus
                    ]]],
                function (err, result) {
                    if (err) throw err;
                    callback();
        })},
        function(callback){
            if(creature.name !== ""){
                con.query(
                    "INSERT IGNORE INTO Names " +
                    "(moniker, name, lastUpdate) " +
                    "VALUES ? ",
                    [[[creature.moniker, creature.name, 0]]],
                    function (err, result) {
                        if (err) throw err;
                        callback();
            })}else{
                callback();
        }},
        function(callback){
            if(eventsForTable.length > 0){
                con.query(
                    "INSERT IGNORE INTO Events " +
                    "(moniker, eventNumber, histEventType, lifeStage, photo, moniker1, moniker2, timeUtc, tickAge, worldTick, worldName, worldId) " +
                    "VALUES ? ",
                    [eventsForTable],
                    function (err, result) {
                        if (err) throw err;
                        callback();
            })}else{
                callback();
        }},
        function(callback){
            if(utxtsForTable.length > 0){
                con.query(
                    "INSERT IGNORE INTO EventUserText " +
                    "(moniker, eventNumber, worldId, utxt, lastUpdate) " +
                    "VALUES ? ",
                    [utxtsForTable],
                    function (err, result) {
                        if (err) throw err;
                        callback();
            })}else{
                callback();
        }},
        function(callback){
            if (children.length > 0){
                con.query(
                    "INSERT IGNORE INTO ParentToChild " +
                    "(parent, child) " +
                    "VALUES ? ",
                    [children],
                    function (err, result) {
                    if (err) throw err;
                    callback();
                });
            }else{
                callback();
            }
        },
        function(callback){
            if(creature.events.length > 0){
                con.query(
                    "INSERT IGNORE INTO ChildToParents " +
                    "(child, parent1, parent2, conceptionEventType) " +
                    "VALUES ? ",
                    [[[moniker, creature.events[0].moniker1, creature.events[0].moniker2, creature.events[0].histEventType]]],
                    function (err, result) {
                    if (err) throw err;
                    callback();
                });
            }else{
                callback();
            }
        }
        ],
        function(err, results){
            res.end();
        });
});

app.get('/api/v1/creatures/:moniker/gender', function (req, res) {
    con.query(
        "SELECT c.gender " +
        "FROM Creatures AS c " + 
        "WHERE c.moniker = ?",
        [req.params.moniker],
        function(err, results, fields){
            if (err) throw err;
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.write(JSON.stringify(results[0]));
            res.end();
        });
});
app.put('/api/v1/creatures/:moniker/gender', function (req, res) {
    con.query(
        "UPDATE Creatures " +
        "SET gender = ? " + 
        "WHERE moniker = ?",
        [req.body.gender, req.params.moniker],
        function(err, results, fields){
            if (err) throw err;
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end();
        });
});

app.get('/api/v1/creatures/:moniker/name', function (req, res) {
    con.query(
        "SELECT n.name " +
        "FROM Names AS n " + 
        "WHERE n.moniker = ?",
        [req.params.moniker],
        function(err, results, fields){
            if (err) throw err;
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.write(JSON.stringify(results[0]));
            res.end();
        });
});
app.put('/api/v1/creatures/:moniker/name', function (req, res) {
    con.query(
        "UPDATE Names " +
        "SET name = ? " + 
        "WHERE moniker = ?",
        [req.body.name, req.params.moniker],
        function(err, results, fields){
            if (err) throw err;
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end();
        });
});

app.get('/api/v1/creatures/:moniker/image', function (req, res) {
    con.query(
        "SELECT event.photo " +
        "FROM Events AS event " +  
        "WHERE event.moniker = ? AND NOT event.photo = '' " +
        "ORDER BY event.timeUTC DESC " +
        "LIMIT 1",
        [req.params.moniker],
        function(err, result, fields){
            if (err) throw err;
            if (result.length === 0){
                res.status(404).end();
            }else{
                var filePath = __dirname + "/images/" + result[0].photo + ".png";
                fs.exists(filePath, function(exists){
                    if(exists){
                        fs.readFile(filePath, function(err, data){
                            if(err){
                                console.log(err);
                                res.status(500).end();
                            }else{
                                res.writeHead(200, {'Content-Type': 'image/png'});
                                res.write(data);
                                res.end();
                            }
                        });
                    }else{
                        console.log("Couldn't find: " + filePath);
                        res.status(500).end();
                    }
                });
            }
    });
});

app.get('/api/v1/creatures/:moniker/kin', function (req, res) {
    con.query(
        "SELECT ChildToParents.parent1 AS parent1Moniker, ChildToParents.parent2 AS parent2Moniker, ChildToParents.conceptionEventType " +
        "FROM ChildToParents " + 
        "WHERE ChildToParents.child = ?",
        [req.params.moniker],
        function(err, results, fields){
            if (err) throw err;
            var creature = results[0];
            con.query(
                "SELECT relation.child AS moniker " +
                "FROM ParentToChild AS relation " + 
                "WHERE relation.parent = ?",
                [req.params.moniker],
                function(err, childrenResult, fields){
                   if (err) throw err;
                   creature.children = childrenResult;
                   res.setHeader('Access-Control-Allow-Origin', '*');
                   res.end(JSON.stringify(creature));
                });
        });
});

app.get('/api/v1/creatures/:moniker/events', function (req, res) {
    con.query(
        "SELECT * " +
        "FROM Events as event " + 
        "WHERE event.moniker = ?",
        [req.params.moniker],
        function(err, result, fields){
           if (err) throw err;
           res.setHeader('Access-Control-Allow-Origin', '*');
           res.end(JSON.stringify(result));
        });
});

app.put('/api/v1/creatures/:moniker/events/:eventNumber', function (req, res) {
    console.log(req.body);
    
    con.query(
        "INSERT IGNORE INTO Events " +
        "(moniker, eventNumber, histEventType, lifeStage, photo, moniker1, moniker2, timeUtc, tickAge, worldTick, worldName, worldId,) " +
        "VALUES ? ",
        [[[req.params.moniker, req.params.eventNumber, req.body.histEventType, req.body.lifeStage, req.body.photo, req.body.moniker1, req.body.moniker2, req.body.timeUtc, req.body.tickAge, req.body.worldTick, req.body.worldName, req.body.worldId]]],
        function(err, results, fields){
            if (err) throw err;
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end();
        });
    
    con.query(
        "INSERT IGNORE INTO EventUserText " +
        "(moniker, eventNumber, worldId, userText, lastUpdate) " +
        "VALUES ? ",
        [[[req.params.moniker, req.params.eventNumber, req.body.worldId, req.body.userText, 0]]],
        function(err, results, fields){
            if (err) throw err;
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end();
        });
});

app.put('/api/v1/creatures/:moniker/events/:eventNumber/user-text', function (req, res) {
    console.log(req.body);
    
    con.query(
        "UPDATE EventUserText " +
        "SET userText = ? " +
        "WHERE moniker = ? AND eventNumber = ? AND worldId = ?",
        [[[req.body.userText, req.params.moniker, req.params.eventNumber, req.body.worldId]]],
        function(err, results, fields){
            if (err) throw err;
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end();
        });
});



app.get('/api/v1/creatures/:moniker/events/:eventNumber/image', function (req, res) {
    con.query(
        "SELECT event.photo " +
        "FROM Events AS event " +  
        "WHERE event.moniker = ? AND event.eventNumber = ?",
        [req.params.moniker, req.params.eventNumber],
        function(err, result, fields){
            if (err) throw err;
            if (result.length === 0){
                res.status(404).end();
            }else if (result[0].photo == ""){
                res.status(404).end();
            }else{
                var filePath = __dirname + "/images/" + result[0].photo + ".png";
                fs.exists(filePath, function(exists){
                    if(exists){
                        fs.readFile(filePath, function(err, data){
                            if(err){
                                console.log(err);
                                res.status(500).end();
                            }else{
                                res.writeHead(200, {'Content-Type': 'image/png'});
                                res.write(data);
                                res.end();
                            }
                        });
                    }else{
                        console.log("Couldn't find: " + filePath);
                        res.status(500).end();
                    }
                });
            }
    });
});
app.head('/api/v1/creatures/:moniker/events/:eventNumber/image', function (req, res) {
    con.query(
        "SELECT event.photo " +
        "FROM Events AS event " +  
        "WHERE event.moniker = ? AND event.eventNumber = ?",
        [req.params.moniker, req.params.eventNumber],
        function(err, result, fields){
            if (err) throw err;
            if (result.length === 0){
                res.status(404).end();
            }else if (result[0].photo == ""){
                res.status(404).end();
            }else{
                var filePath = __dirname + "/images/" + result[0].photo + ".png";
                fs.exists(filePath, function(exists){
                    if(exists){
                        res.status(200).end();
                    }else{
                        res.status(500).end();
                    }
                });
            }
    });
});
app.put('/api/v1/creatures/:moniker/events/:eventNumber/image', function (req, res) {
    con.query(
        "SELECT event.photo " +
        "FROM Events AS event " +  
        "WHERE event.moniker = ? AND event.eventNumber = ?",
        [req.params.moniker, req.params.eventNumber],
        function(err, result, fields){
            if (err) throw err;
            if (result.length === 0){
                res.status(400).end();
            }else if (result[0].photo == ""){
                res.status(400).end();
            }else{
                var filePath = __dirname + "/images/" + result[0].photo + ".png";
                fs.writeFile(filePath, req.body, function(err) {
                    if(err){
                        console.log(err);
                        res.status(500).end();
                    }else{
                        res.status(204).end();
                    }
                 });
            }
    });
});

app.put('/api/v1/creatures/images/:imageName', function (req,res) {
  console.log(req.params.imageName);
  var filePath = __dirname + "/images/" + req.params.imageName + ".png";
  fs.writeFile(filePath, req.body, function(err) {
    if(err){
        console.log(err);
        res.status(500).end();
    }else{
        res.status(204).end();
    }
  });
});
