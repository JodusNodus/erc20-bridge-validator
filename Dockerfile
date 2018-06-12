FROM node:9-alpine
ARG NPM_TOKEN
ENV NPM_TOKEN=$NPM_TOKEN
RUN mkdir -p /srv
WORKDIR /srv
COPY . /srv
# COPY ./*.png /srv/src/docs/
RUN echo "//registry.npmjs.org/:_authToken=\${NPM_TOKEN}" > ~/.npmrc && \
  apk --update add --no-cache openssh-client git make gcc g++ python rsync bash && \
  npm install
CMD ["node", "bin.js"]
