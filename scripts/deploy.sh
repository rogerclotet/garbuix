#!/bin/sh -e

if [ -z "$SSH_PASSWORD" ]; then
  echo "SSH_PASSWORD is not set"
  exit 1
fi

if [ -z "$SSH_USERNAME" ]; then
  echo "SSH_USERNAME is not set"
  exit 1
fi

if [ -z "$SSH_IP" ]; then
  echo "SSH_IP is not set"
  exit 1
fi

if [ -z "$SSH_PROJECT_DIRECTORY" ]; then
  echo "SSH_PROJECT_DIRECTORY is not set"
  exit 1
fi

if [ -z "$PORT" ]; then
  echo "PORT is not set"
  exit 1
fi

(
	/usr/bin/sshpass -p $SSH_PASSWORD ssh $SSH_USERNAME@$SSH_IP -o StrictHostKeyChecking=no <<-EOF
	    set -e
	    source ~/.bashrc
	    cd $SSH_PROJECT_DIRECTORY
	    git pull
	    export APP_PORT=$PORT
	    docker builder prune -f --filter "until=24h" || true
	    docker compose up -d --build --remove-orphans
	    docker image prune -f
	    docker builder prune -f --filter "until=24h"
	EOF
	)
