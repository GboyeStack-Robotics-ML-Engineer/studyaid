# 🚀 How to Deploy StudyAid on Render

Deployment is automated using the `render.yaml` file in this repository.

> **Before you start:** Make sure your code is pushed to a GitHub repository.

## Step 1: Create a New Blueprint

1.  Log in to [Render.com](https://render.com).
2.  Click **New +** and select **Blueprint**.
3.  Connect your GitHub account and select your `studyaid` repository.
4.  Give the blueprint a name (e.g., `studyaid-deploy`).
5.  Click **Apply**.

Render will automatically detect the `render.yaml` file and create two services:
1.  **studyaid-server** (Web Service)
2.  **studyaid-client** (Static Site)

## Step 2: Configure Service Account Credentials

For security, the `service-account.json` file is ignored and NOT in your GitHub repo. You must add it to Render manually.

1.  Go to the **Dashboard** in Render.
2.  Click on the newly created **studyaid-server** Web Service.
3.  Click **"Secret Files"** in the left sidebar.
4.  Click **"Add Secret File"**.
5.  **Filename:** `service-account.json`
6.  **Content:** Paste the *entire content* of your local `server/service-account.json` file here.
7.  Click **Save Changes**.

## Step 3: Set Environment Variables

1.  Still in the **studyaid-server** service, go to **"Environment"** in the left sidebar.
2.  Add a new environment variable:
    -   **Key:** `GOOGLE_APPLICATION_CREDENTIALS`
    -   **Value:** `/etc/secrets/service-account.json`
3.  Click **Save Changes**.

## Step 4: Verify Deployment

1.  Render will automatically redeploy the server when you save changes.
2.  Wait for the deployment to finish (green checkmark).
3.  Your app is now live! 
4.  Visit the **studyaid-client** URL (e.g., `https://studyaid-client.onrender.com`).

---

## Troubleshooting

-   **"Google Application Credentials not found"**: Ensure you completed **Step 3** correctly and the path matches `/etc/secrets/service-account.json`.
-   **"502 Bad Gateway"**: Check the server logs in Render. It usually means the server failed to start (likely due to missing credentials).
-   **Audio not working**: Ensure your browser allows autoplay audio.
