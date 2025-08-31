FROM node:22
WORKDIR /app
COPY package.json ./
# Set npm configuration to handle SSL and performance issues
RUN npm config set fund false && \
    npm config set audit false && \
    npm config set progress false && \
    npm config set strict-ssl false && \
    npm install --verbose
COPY . .
CMD ["npm", "run", "dev", "--", "--host"]
