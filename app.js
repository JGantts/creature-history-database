var express = require('express');
var mysql = require('mysql');
var async = require('async');
var bodyParser = require('body-parser');
var config = require('./config').production;

var app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var server = app.listen(8081, function () {
   var host = server.address().address;
   var port = server.address().port;
   console.log("Example app listening at http://%s:%s", host, port);
});

app.get('/listUsers', function (req, res) {
   fs.readFile( __dirname + "/" + "users.json", 'utf8', function (err, data) {
      console.log( data );
      res.end( data );
   });
});

app.put('/api/v1/creatures', function (req, res) {
    var creature = req.body;
    var birthEvent = creature.events[0];
    
    var events = creature.events
    .map( (event) => {return [
               creature.moniker,
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
               event.userText
    ];});
    
    console.log(events);
    
    var con = mysql.createConnection({
      host: config.database.host,
      user: config.database.user,
      password: config.database.password,
      database: config.database.db
    });
    con.connect(function(err) {
        if (err) throw err;
        console.log("Connected!");
        con.query(
            "INSERT INTO Creatures " +
            "(moniker, name, crossoverPointMutations, pointMutations, gender, genus, birthEventType, birthdate, parent1Moniker, parent2Moniker) " +
            "VALUES ? ",
            [[[
                creature.moniker,
                creature.name,
                creature.crossoverPointMutations,
                creature.pointMutations,
                creature.gender,
                creature.genus,
                birthEvent.histEventType,
                birthEvent.timeUtc,
                birthEvent.moniker1,
                birthEvent.moniker2
                ]]],
            function (err, result) {
            if (err) throw err;
            con.query(
                "INSERT INTO Events " +
                "(moniker, histEventType, lifeStage, photo, moniker1, moniker2, timeUtc, tickAge, worldTick, worldName, worldId, userText) " +
                "VALUES ? ",
                [events],
                function (err, result) {
                if (err) throw err;
                console.log("1 record inserted");
            });
        });
    });
    
    res.end("");
});

