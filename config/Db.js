import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// avoid strictQuery deprecation warnings
mongoose.set("strictQuery", false);

const connectDb = async () => {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) {
    console.warn(
      "⚠️ MONGO_URI not set in .env – skipping MongoDB connection (backend will still run)."
    );
    return;
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName: dbName || undefined,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000,
    });

    console.log(
      `✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`
    );
    return conn;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    // IMPORTANT: don't throw, so the backend keeps running
    // throw err;
  }
};

export default connectDb;
