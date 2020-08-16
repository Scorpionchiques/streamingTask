'use strict';
const hlsStreamsList = require('../../hlsStreamsList').hlsStreamsList
const { EventEmitter } = require('events');

const { PassThrough } = require('stream')
const fs = require('fs')

const { RTCAudioSink, RTCVideoSink } = require('wrtc').nonstandard;

const ffmpeg = require('fluent-ffmpeg')
const { StreamInput } = require('fluent-ffmpeg-multistream')

const broadcaster = new EventEmitter();
const { on } = broadcaster;

function beforeOffer(peerConnection) {
  const audioTransceiver = peerConnection.addTransceiver('audio');
  const videoTransceiver = peerConnection.addTransceiver('video');

  const audioTrack = broadcaster.audioTrack = audioTransceiver.receiver.track;
  const videoTrack = broadcaster.videoTrack = videoTransceiver.receiver.track;

  const audioSink = new RTCAudioSink(audioTransceiver.receiver.track);
  const videoSink = new RTCVideoSink(videoTransceiver.receiver.track);

  const stream = {
    reStreamPath: `hls/webcam_${Math.random().toString(36).substring(7)}`,
    size: null,
    video: null,
    audio: null
  };
  hlsStreamsList.push(stream.reStreamPath)

  videoSink.addEventListener('frame', ({ frame: { width, height, data } }) => {
    const size = width + 'x' + height;
    if (stream.size !== size) {

      if (stream.audio) {
        stream.audio.end();
        stream.audio = null;
      }
      if (stream.video) {
        stream.video.end();
        stream.video = null;
      }


      stream.size = size;
      stream.video = new PassThrough()
      stream.audio = new PassThrough()

      const onAudioData = ({ samples: { buffer } }) => {
        if (stream.audio) {
          try {
            stream.audio.push(Buffer.from(buffer));
          } catch (e) {
            console.log(e)
          }
        }
      };

      audioSink.addEventListener('data', onAudioData);

      stream.audio.on('end', () => {
        audioSink.removeEventListener('data', onAudioData);
      });

      stream.proc = ffmpeg()
        .addInput((new StreamInput(stream.video)).url)
        .addInputOptions([
          '-f', 'rawvideo',
          '-pix_fmt', 'yuv420p',
          '-s', stream.size,
        ])
        .addInput((new StreamInput(stream.audio)).url)
        .addInputOptions([
          '-f s16le',
        ])
        // .addOption('-hls_time', 5)
        // // include all the segments in the list
        // .addOption('-hls_list_size', 0)

        .on('start', () => {
          if (!fs.existsSync(stream.reStreamPath)) {
            fs.mkdirSync(stream.reStreamPath);
          } else {
            fs.rmdirSync(stream.reStreamPath, { recursive: true });
            fs.mkdirSync(stream.reStreamPath);
          }
          console.log('Start streaming >> ', stream.reStreamPath)
        })
        .on('end', () => {
          console.log('Stop streaming >> ', stream.reStreamPath)
        })
        // .audioCodec('aac')
        // .flvmeta()
        // .format('flv')
        .outputOptions([
          // '-hls_time 8',
          // '-hls_playlist_type event',
          '-hls_list_size 5'
        ])
        .output(`${stream.reStreamPath}/index.m3u8`);

      stream.proc.run();
    }
    if (stream.video)
      stream.video.push(Buffer.from(data));
  });

  broadcaster.emit('newBroadcast', {
    audioTrack,
    videoTrack
  });

  const { close } = peerConnection;
  peerConnection.close = function () {

    audioTrack.stop()
    videoTrack.stop()

    if (stream.audio) {
      stream.audio.end();
      stream.audio = null;
    }
    if (stream.video) {
      stream.video.end();
      stream.video = null;
    }

    if (fs.existsSync(stream.reStreamPath))
      setInterval(() => {
        fs.rmdirSync(stream.reStreamPath, { recursive: true });
      }, 10000)


    const index = hlsStreamsList.indexOf(stream.reStreamPath);
    if (index > -1) {
      hlsStreamsList.splice(index, 1);
    }

    return close.apply(this, arguments);
  };
}

module.exports = {
  beforeOffer,
  broadcaster
};
