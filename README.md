# SyncVerse

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-dkjtf51l)

## Getting Started

To run this project locally, you need to set up your environment variables. 

### Prerequisites

This project requires a [Supabase](https://supabase.com/) backend to function correctly. 

### Environment Variables (API Keys)

Create a `.env` file in the root directory of the project and add the following keys:

```env
VITE_SUPABASE_URL="your-supabase-project-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

1. **`VITE_SUPABASE_URL`**: The RESTful endpoint for your Supabase project. You can find this in your Supabase Dashboard under `Project Settings > API > Project URL`.
2. **`VITE_SUPABASE_ANON_KEY`**: The public, anonymous key for your Supabase project. You can find this in your Supabase Dashboard under `Project Settings > API > Project API Keys`.

### Running the App Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open http://localhost:5173/ in your browser.
