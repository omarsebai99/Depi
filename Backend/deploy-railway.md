# Deploying Express Backend on Railway

Follow these steps to deploy the `/Backend` directory of this project onto Railway:

## 1. Create a New Project on Railway
1. Go to [Railway.app](https://railway.app) and sign in.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your repository.
4. **IMPORTANT**: Before clicking deploy, click on **Settings** and set the **Root Directory** to `/Backend`. (This tells Railway to ignore the frontend and AI folders, building only the Express backend).

## 2. Set Environment Variables
In your Railway service dashboard, navigate to the **Variables** tab and add the following:

| Variable | Description | Example / Note |
| --- | --- | --- |
| `PORT` | The port Railway uses | (Automatically provided by Railway) |
| `MONGODB_URI` | MongoDB connection string | `mongodb://user:pass@host1:27017,host2:27017/dbname?ssl=true...` |
| `JWT_SECRET` | Secret token string for signing cookies/auth | `your_super_secret_jwt_string_here` |
| `AI_SERVICE_URL` | Deployed URL of your FastAPI AI service | `https://your-ai-service.up.railway.app` |
| `FRONTEND_URL` | Deployed URL of your frontend | `https://your-frontend-app.vercel.app` |

## 3. Automatic Deployment
Once the variables are configured, Railway will automatically run Nixpacks to install Node packages and start the application using `npm start` (driven by the provided `railway.json` and `Procfile` configs).
