import rateLimit from "express-rate-limit";

export const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: { message: "Too many requests from this IP, please try again later." },
  headers: true, // Send RateLimit headers
});
