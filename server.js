require('dotenv').config();

const http2 = require('http2');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const numCPUs = os.cpus().length / 2;

const repo_info = process.env.repo_info.split('/');
const owner = repo_info[0];
const repo = repo_info[1];

if (cluster.isMaster) {
	console.log(`Master ${process.pid} is running`);

	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
	}

	cluster.on('exit', (worker) => {
		console.log(`Worker ${worker.process.pid} died`);
	});
} else {
	const server = http2.createSecureServer({
		key: fs.readFileSync(process.env.PRIVATE_KEY_PATH),
		cert: fs.readFileSync(process.env.CERTIFICATE_PATH)
	});

	server.on('stream', (stream, headers) => {
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
							return;
						case 4:
							stream.respond({
								'content-type': 'application/json; charset=utf-8',
								':status': 500
							});
							stream.end(JSON.stringify({ message: "NG", apistatus: "response_code" }))
							return;
					}
				} catch (error) {
					stream.respond({
						'content-type': 'application/json; charset=utf-8',
						':status': 500
					});
					stream.end(JSON.stringify({ message: "Unexpected error:" + error.message }));
				}
			});
        } else if (headers[':method'] === 'GET') {
            stream.on('end',async() => {
                stream.respond({
					'content-type': 'text/html; charset=utf-8',
					':status': 200
				});
				stream.end(fs.readFileSync('./src/html/index.html'));
            })
		}
	});

	server.listen(8443, () => {
		console.log(`Worker ${process.pid} started`);
	});
}
