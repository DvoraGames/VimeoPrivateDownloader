# Vimeo Private Video Downloader

Node.js script helps you to download private videos from [Vimeo](https://vimeo.com)

Before you start, make sure you have installed [Node.js](https://nodejs.org/en/download/).

To check it run in terminal `node -v`. You will see `v10.11.0` for example. If you get error, install latest [Node.js](https://nodejs.org/en/download/).

## Download and Convert

To download videos and convert them to .mp4 you have to:

1.  Open the browser developer tools on the network tab (`F12` on Windows/Linux, `CMD + Option + I` on Mac OS).
2.  Start the video (or move mouse over the video).
3.  In the "Network" tab, locate the load of the "master.json" file, copy its full URL.
3.1. In some cases Vimeo sends you encrypted video data, that you can workaround by either removing 'query_string_ranges' query parameter and/or adding 'base64_init=1' to it. 
4.  Fill in `url` and `name`(using as filename) fields in `videojson.js` file
5.  Run: `node index.js` or `npm run start`
6.  Wait for console output `"🏁", <filename.mp4> converted successfully`
7.  Go to output folder and your converted .mp4 files will be there.