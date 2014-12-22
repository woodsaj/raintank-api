#/bin/sh

DBHOST=$1
for i in *.json; do c=$(basename $i .json); mongoimport -h $DBHOST -u dbuser -p dbpass --db raintank --collection $c --file $i ; done
