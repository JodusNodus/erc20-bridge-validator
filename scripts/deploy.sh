#!/bin/bash -x
if ([ $TRAVIS_BRANCH == "master" ]); then npm run semantic-release; fi
docker build --build-arg NPM_TOKEN=${NPM_TOKEN} -t settlemint/erc20-bridge-validator:${TRAVIS_BRANCH} .
yes Y | docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"
docker push settlemint/erc20-bridge-validator
