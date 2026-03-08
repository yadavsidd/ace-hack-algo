# Vercel Deployment Guide

This guide provides step-by-step instructions for deploying the Ace Hack Algo application on Vercel.

## Prerequisites

- A [Vercel account](https://vercel.com) (free tier available)
- Git repository pushed to GitHub, GitLab, or Bitbucket
- API keys and secrets for required services (see Environment Variables below)

## Required Environment Variables

Before deploying, gather the following environment variables:

### 1. **GEMINI_API_KEY** (Required)
- **Purpose**: Google Gemini AI API key for AI features
- **How to get it**:
  1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
  2. Click "Create API Key" in a new project
  3. Copy the generated API key
- **Note**: Keep this secret and never commit it to version control

### 2. **APP_URL** (Required)
- **Purpose**: The URL where your app is hosted (used for OAuth callbacks and API endpoints)
- **Value**: Vercel will automatically provide this as your deployment URL
  - Format: `https://your-project-name.vercel.app`
  - Or your custom domain if configured
- **When deploying**: You can set this after your first deployment, or use a placeholder initially

### 3. **VITE_WALLETCONNECT_PROJECT_ID** (Required)
- **Purpose**: WalletConnect integration for cryptocurrency wallet connections
- **How to get it**:
  1. Visit [WalletConnect Cloud](https://cloud.walletconnect.com/)
  2. Sign up/Log in
  3. Create a new project
  4. Copy your Project ID
- **Current value**: `92d1398bec6647419b1e2e4fe6f4d85d` (already configured in .env.example)

## Deployment Steps

### Step 1: Connect Repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Select your git provider (GitHub, GitLab, or Bitbucket)
3. Authorize Vercel to access your repositories
4. Find and import the `ace-hack-algo` repository
5. Click "Import"

### Step 2: Configure Project

1. **Project Name**: Use any name (e.g., `ace-hack-algo`)
2. **Framework**: Select "Other" or "Vite"
3. **Root Directory**: Leave as default (or select root if prompted)

### Step 3: Add Environment Variables

1. In the Vercel dashboard, go to **Settings** → **Environment Variables**
2. Add each variable below:

| Variable Name | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Your Gemini API key | Required. Keep secret. |
| `VITE_WALLETCONNECT_PROJECT_ID` | Your WalletConnect Project ID | Required. |
| `APP_URL` | `https://your-project-name.vercel.app` | Update with your actual Vercel URL after first deployment |

**To add variables:**
1. Click "Add New"
2. Enter the variable name
3. Enter the value
4. Select all environments (Production, Preview, Development)
5. Click "Save"

### Step 4: Configure Build Settings

Vercel should auto-detect the build settings. If not, verify in **Settings** → **Build & Development**:

- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 5: Deploy

1. After configuring environment variables, click the **Deploy** button
2. Watch the deployment logs in the Vercel dashboard
3. Once complete, you'll receive a deployment URL

### Step 6: Update APP_URL (Important)

1. Once deployed, copy your Vercel URL
2. Go back to **Settings** → **Environment Variables**
3. Update `APP_URL` with your actual deployment URL (e.g., `https://ace-hack-algo.vercel.app`)
4. Redeploy the application for the change to take effect

**To redeploy:**
- Make a small commit and push to your main branch, OR
- Click the latest deployment → **Redeploy** button

## Automatic Deployments

By default, Vercel will automatically deploy on every push to your main branch:

- **Production**: Deployments from `main` branch
- **Preview**: Deployments from pull requests and other branches

You can configure this in **Settings** → **Git** if needed.

## Custom Domain Setup (Optional)

1. In Vercel dashboard, go to **Settings** → **Domains**
2. Click "Add Domain"
3. Enter your custom domain
4. Follow DNS configuration instructions from your domain provider
5. Update `APP_URL` environment variable with your custom domain

## Monitoring & Logs

- **Deployment Logs**: Available in the Vercel dashboard under "Deployments"
- **Runtime Logs**: View in "Functions" tab for serverless function logs
- **Errors**: Check the browser console and deployment logs for issues

## Troubleshooting

### Build Fails
- Check the build logs in Vercel dashboard
- Verify all dependencies are in `package.json`
- Ensure `npm run build` works locally first

### Environment Variables Not Working
- Verify variables are added in the correct Vercel environment (Production, Preview, Development)
- Redeploy after adding/updating variables
- Check that variable names match exactly (case-sensitive)

### GEMINI_API_KEY Errors
- Ensure API key is valid and active in Google AI Studio
- Check that the key has necessary permissions
- Regenerate key if issues persist

### WalletConnect Not Working
- Verify Project ID is correct and active
- Ensure `VITE_WALLETCONNECT_PROJECT_ID` starts with `VITE_` (required for client-side access)

## Security Best Practices

1. **Never commit secrets**: Use environment variables instead of hardcoding
2. **Rotate keys regularly**: Update API keys periodically
3. **Monitor usage**: Track API usage in Google Cloud and WalletConnect dashboards
4. **Use preview deployments**: Test changes before merging to main

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html#vercel)
- [Environment Variables in Vercel](https://vercel.com/docs/projects/environment-variables)
- [Google AI Studio](https://aistudio.google.com/)
- [WalletConnect Cloud](https://cloud.walletconnect.com/)

## Support

For deployment issues or questions:
- Check Vercel's [support documentation](https://vercel.com/support)
- Review application logs in Vercel dashboard
- Verify API keys and credentials are valid
