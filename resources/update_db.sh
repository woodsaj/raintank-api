#!/bin/sh

for i in actionTypes collectorTypes dataObjectTypes locations roles analysisTypes; do 

    mongo -u dbuser -p dbpass localhost/raintank --eval "db.${i}.drop()";
    mongoimport -h localhost -u dbuser -p dbpass --db raintank --collection $i --file $i.json
done



