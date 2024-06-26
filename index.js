const fs = require("fs");
const url = require("url");
const https = require("https");
const { exec } = require('child_process');
const log = (...args) => console.log("→", ...args);
const list = require("./videojson.js");

const path = require('path'); // Import the path module

// Function to replace \u0026 with &
function decodeUrl(inputUrl) {
  return inputUrl.replace(/\\u0026/g, '&');
}

function loadVideo(num, cb) {
  let rawMasterUrl = new URL(decodeUrl(list[num].url));
  let masterUrl = rawMasterUrl.toString();

  getJson(masterUrl, num, (err, json) => {
    if (err) {
      return cb(err);
    }

    // Filter videoData to include only 1920x1080 resolution or 1280x720 resolution
    const fullHdVideos = json.video.filter(video => video.width === 1920 && video.height === 1080);
    const hdVideos = json.video.filter(video => video.width === 1280 && video.height === 720);

    let videoData;
    if (fullHdVideos.length > 0) {
      videoData = fullHdVideos
        .sort((v1, v2) => v1.avg_bitrate - v2.avg_bitrate)
        .pop();
    } else if (hdVideos.length > 0) {
      videoData = hdVideos
        .sort((v1, v2) => v1.avg_bitrate - v2.avg_bitrate)
        .pop();
    } else {
      return cb(new Error("No suitable video resolution found"));
    }

    let audioData = {};
    if (json.audio !== null) {
      audioData = json.audio
        .sort((a1, a2) => a1.avg_bitrate - a2.avg_bitrate)
        .pop();
    }

    const videoBaseUrl = url.resolve(
      url.resolve(masterUrl, json.base_url),
      videoData.base_url
    );

    let audioBaseUrl = "";
    if (json.audio !== null) {
      audioBaseUrl = url.resolve(
        url.resolve(masterUrl, json.base_url),
        audioData.base_url
      );
    }

    processFile(
      "video",
      videoBaseUrl,
      videoData.init_segment,
      videoData.segments,
      (num + 1) + " - " + list[num].name + ".m4v",
      err => {
        if (err) {
          cb(err);
        }

        if (json.audio !== null) {
          processFile(
            "audio",
            audioBaseUrl,
            audioData.init_segment,
            audioData.segments,
            (num + 1) + " - " + list[num].name + ".m4a",
            err => {
              if (err) {
                cb(err);
              }

              convertToMp4('./parts');

              cb(null, num + 1);
            }
          );
        }
      }
    );
  });
}

function processFile(type, baseUrl, initData, segments, filename, cb) {
  const file = filename;
  const filePath = `./parts/${file}`;
  const downloadingFlag = `./parts/.${file}~`;

  if (fs.existsSync(downloadingFlag)) {
    log("⚠️", ` ${file} - ${type} is incomplete, restarting the download`);
  } else if (fs.existsSync(filePath)) {
    log("⚠️", ` ${file} - ${type} already exists`);
    cb();
  } else {
    fs.writeFileSync(downloadingFlag, '');
  }

  const segmentsUrl = segments.map(seg => {
    if (!seg.url) {
      throw new Error(`found a segment with an empty url: ${JSON.stringify(seg)}`);
    }
    return baseUrl + seg.url;
  });

  const initBuffer = Buffer.from(initData, "base64");
  fs.writeFileSync(filePath, initBuffer);

  const output = fs.createWriteStream(filePath, {
    flags: "a"
  });

  combineSegments(type, 0, segmentsUrl, output, filePath, downloadingFlag, err => {
    if (err) {
      log("⚠️", ` ${err}`);
    }

    output.end();
    cb();
  });
}

function combineSegments(type, i, segmentsUrl, output, filename, downloadingFlag, cb) {
  if (i >= segmentsUrl.length) {
    if (fs.existsSync(downloadingFlag)) {
      fs.unlinkSync(downloadingFlag);
    }
    log(
      "🏁",
      type === "video" ? "🎞️" : "🎧",
      `download of ${filename} is done`
    );
    return cb();
  }

  log(
    "📦",
    type === "video" ? "🎞️" : "🎧",
    `Downloading ${type} segment ${i}/${segmentsUrl.length} of ${filename}`
  );

  let req = https
    .get(segmentsUrl[i], res => {
      if (res.statusCode != 200) {
        cb(new Error(`Downloading segment with url '${segmentsUrl[i]}' failed with status: ${res.statusCode} ${res.statusMessage}`))
      }

      res.on("data", d => output.write(d));

      res.on("end", () =>
        combineSegments(type, i + 1, segmentsUrl, output, filename, downloadingFlag, cb)
      );
    })
    .on("error", e => {
      cb(e);
    });

  req.setTimeout(7000, function () {
    log("⚠️", 'Timeout. Retrying');
    combineSegments(type, i, segmentsUrl, output, filename, downloadingFlag, cb);
  });
}

function getJson(url, n, cb) {
  let data = "";

  https
    .get(url, res => {
      if (res.statusMessage.toLowerCase() !== 'gone') {
        res.on("data", d => (data += d));
        res.on("end", () => cb(null, JSON.parse(data)));
      } else {
        return cb(`The master.json file is expired or crushed. Please update or remove it from the sequence (broken on ` + n + ` position)`);
      }
    })
    .on("error", e => {
      return cb(e);
    });
}

function initJs(n = 0) {
  if (!list[n] || (!list[n].name && !list[n].url)) return;

  loadVideo(n, (err, num) => {
    if (err) {
      log("⚠️", ` ${err}`);
    }

    if (list[num]) {
      initJs(num);
    }
  });
}

initJs();

function convertToMp4(directory) {
  fs.readdir(directory, (err, files) => {
    if (err) {
      console.error(err);
      return;
    }

    files.forEach(file => {
      if (path.extname(file) === '.m4v') {
        const baseName = path.basename(file, '.m4v');
        const audioFile = path.join(directory, `${baseName}.m4a`);
        const videoFile = path.join(directory, file);
        const outputFile = path.join('./output', `${baseName}.mp4`);
        
        exec(`ffmpeg -y -v quiet -i "${audioFile}" -i "${videoFile}" -c copy "${outputFile}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return;
          }
          log("🏁", `${outputFile} converted successfully`);
        });
      }
    });
  });
}
