require('dotenv').config();

const http2 = require('http2');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const numCPUs = os.cpus().length / 2;
const logStream = fs.createWriteStream("access.log", {flags:'a'});
const { exec } = require("child_process");

const repo_info = process.env.repo_info.split('/');
const owner = repo_info[0];
const repo = repo_info[1];
function log(Method,Location,IP,StatusCode) {
	console.log(`[http] Access ${Method} ${Location} From ${IP}: ${StatusCode}\n`);
	logStream.write(`[http] Access ${Method} ${Location} From ${IP}: ${StatusCode}\n`)
}
function archiveLogFile() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '-').replace(/:/g, '-').split('.')[0]; // YYYY-MM-DD-HH-MM
    const archiveName = `logs-${timestamp}.tgz`;

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
    archiveLogFile();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down...");
    archiveLogFile();
    process.exit(0);
});

if (cluster.isMaster) {
	console.info(`Master ${process.pid} is running`);

	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
		console.info(`Worker ${i} started`);
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
			server.on('data', chunk => {
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
							log(method,location,ip,201);
							return;
						case 4:
							stream.respond({
								'content-type': 'application/json; charset=utf-8',
								':status': 500
							});
							stream.end(JSON.stringify({ message: "NG", apistatus: "response_code" }))
							log(method,location,ip,500);
							return;
					}
				} catch (error) {
					stream.respond({
						'content-type': 'application/json; charset=utf-8',
						':status': 500
					});
					stream.end(JSON.stringify({ message: "Unexpected error:" + error.message }));
					log(method,location,ip,500);
				}
			});
        } else if (headers[':method'] === 'GET') {
            stream.on('end',async() => {
                stream.respond({
					'content-type': 'text/html; charset=utf-8',
					':status': 200
				});
				log(method,location,ip,200);
				stream.end(fs.readFileSync('./src/html/index.html'));
            })
		}
	});

	server.listen(8443, () => {
		console.log(`Worker ${process.pid} started`);
	});
}
