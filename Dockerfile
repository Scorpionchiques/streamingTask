FROM ubuntu:20.04

ENV TZ=Europe/Moscow
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN apt-get update; apt-get install -y curl nano git ffmpeg
RUN curl -sL https://deb.nodesource.com/setup_12.x -o nodesource_setup.sh

RUN bash nodesource_setup.sh

RUN apt-get install -y build-essential nodejs make gcc g++

WORKDIR . /app

COPY package*.json ./

RUN npm install

COPY . .


CMD [ "npm", "start"]