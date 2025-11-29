import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// avoid strictQuery deprecation warnings (adjust as needed)
mongoose.set("strictQuery", false);
const connectDb = async () => {
    try {
        const connectDatabase = await mongoose.connect(process.env.MONGO_URI, {
            dbName: process.env.DB_NAME,
        });
        console.log(`MongoDB connected: ${connectDatabase.connection.host}`);
        return connectDatabase;
    } catch (err) {
        console.error(`MongoDB connection error: ${err.message}`);
        throw err;
    }
};
export default connectDb;
