require('dotenv').config();

const http2 = require('http2');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
const numCPUs = process.env.WORKERS || os.cpus().length;
const logStream = fs.createWriteStream("access.log", {flags:'a'});
const { exec } = require("child_process");
const path = require('path');

const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repo_info = process.env.repo_info.split('/');
const owner = repo_info[0];
const repo = repo_info[1];

function logToMaster(Method, Location, IP, StatusCode) {
	process.send({ type: 'log', method: Method, location: Location, ip: IP, statusCode: StatusCode });
}
function archiveLogFile() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '-').replace(/:/g, '-').split('.')[0]; // YYYY-MM-DD-HH-MM
    const archiveName = `logs-${timestamp}.tar.gz`;

    console.log(`Archiving log file as ${archiveName}...`);

    exec(`tar -czf ${archiveName} access.log`, (error) => {
        if (error) {
            console.error(`Error compressing log file: ${error.message}`);
            return;
        }
        console.log(`Log file archived as ${archiveName}`);
        fs.unlinkSync("access.log");
    });
}
process.on("SIGINT", () => {
    console.log("SIGINT received. Shutting down...");
    if (cluster.isMaster) {
		archiveLogFile()
	}
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down...");
    if (cluster.isMaster) {
		archiveLogFile()
	}
    process.exit(0);
});

if (cluster.isMaster) {
	console.info(`Master ${process.pid} is running`);

	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
		console.info(`Worker ${i} started`);

		cluster.on('message', (worker, message) => {
        	if (message.type === 'log') {
            	const logMessage = `[http] Access ${message.method} ${message.location} From ${message.ip}: ${message.statusCode}\n`;
            	console.log(logMessage);
            	logStream.write(logMessage);
        	}
    	});
	}

	cluster.on('exit', (worker) => {
		console.info(`Worker ${worker.process.pid} died`);
	});
} else {
	const server = http2.createSecureServer({
		key: fs.readFileSync(process.env.PRIVATE_KEY_PATH),
		cert: fs.readFileSync(process.env.CERTIFICATE_PATH)
	});

	server.on('stream', (stream, headers) => {
		let method = headers[':method'];
		let location = headers[':path'];
		let ip = stream.session.socket.remoteAddress;
		if (headers[':method'] === 'PUT') {
			let data = '';
			stream.on('data', chunk => {
				data += chunk;
			});
			stream.on('end', async () => {
				const { title, body , category } = JSON.parse(data);
				try {
					const response = await octokit.rest.issues.create({
						owner: owner,
						repo: repo,
						title: title,
						body: body,
						labels: ["From-WebApp", category]
					});
					let response_code = parseInt(response.status);
					switch (Math.floor(response_code / 100)) {
						case 2:
							stream.respond({
								'content-type': 'application/json; charset=utf-8',
								':status': 201,
								'Location': response.data.html_url
							});
							stream.end(JSON.stringify({ message: "OK", URL: response.data.html_url }))
							logToMaster(method,location,ip,201);
							return;
						case 4:
							stream.respond({
								'content-type': 'application/json; charset=utf-8',
								':status': 500
							});
							stream.end(JSON.stringify({ message: "NG", apistatus: "response_code" }))
							logToMaster(method,location,ip,500);
							return;
					}
				} catch (error) {
					stream.respond({
						'content-type': 'application/json; charset=utf-8',
						':status': 500
					});
					stream.end(JSON.stringify({ message: "Unexpected error" }));
					logToMaster(method,location,ip,500);
					console.error(`Octokit error: ${error.message}`, error.response?.data || error);
				}
			});
        } else if (headers[':method'] === 'GET') {
			const filePath = path.resolve(__dirname, 'src', 'index.html');
			fs.readFile(filePath, (err, data) => {
    			if (err) {
       				stream.respond({
            			'content-type': 'text/plain; charset=utf-8',
           				':status': 500
      				});
       				stream.end("Internal Server Error");
        			logToMaster(method, location, ip, 500);
    			} else {
        			stream.respond({
            			'content-type': 'text/html; charset=utf-8',
            			':status': 200
        			});
        			stream.end(data);
        			logToMaster(method, location, ip, 200);
    			}
			});
		}
	});

	server.listen(443, () => {
		console.log(`Worker ${process.pid} started`);
	});
}
