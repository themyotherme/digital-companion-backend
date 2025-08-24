# 🚀 Digital Companion - Railway Deployment Guide

## 📋 Prerequisites
1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Account**: For code repository
3. **OpenAI API Key**: Already configured in `.env`

## 🚀 Deployment Steps

### Step 1: Create GitHub Repository
1. Go to [GitHub](https://github.com)
2. Create a new repository named `digital-companion-backend`
3. Upload all files from `C:\DigitalCompanion\` to the repository
4. **IMPORTANT**: Add `.env` to `.gitignore` to protect your API keys

### Step 2: Deploy to Railway
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `digital-companion-backend` repository
5. Railway will automatically detect it's a Python app

### Step 3: Configure Environment Variables
In Railway dashboard, add these environment variables:
```
OPENAI_API_KEY=your_openai_api_key_here
EMAILJS_USER_ID=your_emailjs_user_id
EMAILJS_TEMPLATE_ID=your_emailjs_template_id
WHATSAPP_API_KEY=your_whatsapp_api_key
```

### Step 4: Deploy
1. Railway will automatically build and deploy
2. You'll get a URL like: `https://your-app-name.railway.app`
3. Test the deployment by visiting the URL

## 🔧 Files Created for Deployment
- ✅ `Procfile` - Tells Railway how to run the app
- ✅ `requirements.txt` - Python dependencies (updated)
- ✅ `runtime.txt` - Python version specification

## 🌐 After Deployment
1. **Update LifeLovesMe**: Change companion.html to use the Railway URL
2. **Test**: Verify AI chat works on the cloud
3. **Monitor**: Check Railway dashboard for logs and performance

## 💡 Tips
- Railway gives you $5 free credit monthly
- Automatic scaling based on usage
- Easy to upgrade when you scale up
- Built-in monitoring and logs

## 🔗 Next Steps
After successful deployment:
1. Update `LifeLovesMe/public/companion.html` with Railway URL
2. Deploy the updated LifeLovesMe platform
3. Test the complete integration
