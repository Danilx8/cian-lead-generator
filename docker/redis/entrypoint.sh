#!/bin/sh
cat << EOF > /redis.conf
port 6379
user default off
user $REDIS_USERNAME on >$REDIS_PASSWORD ~* +@all allchannels
loadmodule /usr/lib/redis/modules/rejson.so
bind 0.0.0.0
EOF

exec redis-server /redis.conf
