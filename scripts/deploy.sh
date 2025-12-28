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
    docker build -t forja .
    docker stop forja
    docker rm forja
    docker run --name=forja --restart=unless-stopped -d -p $PORT:3000 forja
EOF
)
