/**
 * Example Express wiring for ``src/config/passport.js``.
 * Default PORT=3001 so it does not collide with FastAPI on 8000.
 * Set GOOGLE_REDIRECT_URI / GITHUB_REDIRECT_URI to match this server's callback paths
 * if you run this instead of FastAPI.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const express = require("express");
const session = require("express-session");
const { passport, configurePassport, GOOGLE_SCOPES } = require("./config/passport");

const app = express();
const PORT = process.env.PASSPORT_REF_PORT || 3001;

async function findOrCreateUser(provider, tokens) {
  // TODO: encrypt refreshToken with TUNDE_ENCRYPTION_KEY and persist (same as FastAPI).
  return { provider, id: tokens.profile.id, email: tokens.profile.emails?.[0]?.value };
}

configurePassport(findOrCreateUser);

app.use(
  session({
    secret: process.env.TUNDE_SESSION_SECRET || process.env.TUNDE_ENCRYPTION_KEY || "dev",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.get(
  "/api/auth/google",
  passport.authenticate("google", {
    scope: GOOGLE_SCOPES,
    accessType: "offline",
    prompt: "consent",
  })
);
app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect(process.env.TUNDE_PUBLIC_BASE_URL || "http://localhost:5173/")
);

app.get("/api/auth/github", passport.authenticate("github", { scope: ["user", "repo"] }));
app.get(
  "/api/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  (req, res) => res.redirect(process.env.TUNDE_PUBLIC_BASE_URL || "http://localhost:5173/")
);

app.listen(PORT, () => {
  console.log(`Passport reference server on http://127.0.0.1:${PORT}`);
});
