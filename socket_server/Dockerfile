# Install Node
FROM node:23-alpine

WORKDIR /app

copy dump_chats_as_txts.js .
copy env.example.json ./env.json
copy package-lock.json .
copy package.json .
copy server.js .

copy certs ./certs

RUN npm install

EXPOSE 5433

CMD ["node", "server.js"]