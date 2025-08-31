FROM node:22
WORKDIR /app
COPY package.json ./
RUN npm config set strict-ssl false && npm install
COPY . .
CMD ["npm", "run", "dev", "--", "--host"]
