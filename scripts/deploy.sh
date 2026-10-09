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

if [ -z "$APP_IMAGE" ]; then
  echo "APP_IMAGE is not set"
  exit 1
fi

if [ -z "$SCHEDULER_IMAGE" ]; then
  echo "SCHEDULER_IMAGE is not set"
  exit 1
fi

if [ -z "$REGISTRY_USERNAME" ]; then
  echo "REGISTRY_USERNAME is not set"
  exit 1
fi

if [ -z "$REGISTRY_TOKEN" ]; then
  echo "REGISTRY_TOKEN is not set"
  exit 1
fi

(
	/usr/bin/sshpass -p $SSH_PASSWORD ssh $SSH_USERNAME@$SSH_IP -o StrictHostKeyChecking=no <<-EOF
	    set -e
	    source ~/.bashrc
	    cd $SSH_PROJECT_DIRECTORY
	    git pull
	    export APP_PORT=$PORT
	    trap 'docker logout ghcr.io >/dev/null' EXIT
	    echo "$REGISTRY_TOKEN" | docker login ghcr.io -u "$REGISTRY_USERNAME" --password-stdin
	    DEPLOY_APP_IMAGE=$APP_IMAGE DEPLOY_SCHEDULER_IMAGE=$SCHEDULER_IMAGE sh scripts/deploy-compose.sh
	    docker image prune -f
	    docker builder prune -f --filter "until=24h"
	EOF
	)
