# 作成中...

## このWebアプリについて
Githubアカウントを持っていないユーザーがIssueを作成し、バグや新機能の要望を送信する方法を提供します。
## デプロイ
### 必要条件
- Node.js （推奨:最新ltsバージョン）
- npm （推奨：利用可能な最新バージョン）

まずリポジトリをCloneし、必要なモジュールをインストールします。
```cmd or bash
git clone https://github.com/Yu-yu0202/GithubFeedbackApp.git GithubFeedbackApp
cd GithubFeedbackApp
npm i
```
次に.envファイルを作成し、環境変数をセットします。
```bash
touch .env
nano .env
```
```.env
GITHUB_TOKEN = YOUR_GITHUB_TOKEN
repo_info = Issueを作成したいリポジトリ(例:Yu-yu0202/GithubFeedbackApp)
PRIVATE_KEY_PATH = Your_KEY_Path(ex: ./cert/privkey.key)
CERTIFICATE_PATH = Your_CERT_Path(ex: ./cert/cert.pem)
```