#!/bin/sh

mongo -u dbuser -p dbpass db.webcheck.sg/raintank --eval 'db.getCollectionNames().forEach(function(collection) { if (collection.indexOf("system") == -1) { eval( "db." + collection+".drop();");}})';

