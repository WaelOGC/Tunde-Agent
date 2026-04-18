/**
 * Passport strategies aligned with ``tunde_agent.api.oauth`` (FastAPI + Authlib).
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
 *      GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI
 *
 * Production traffic should hit the FastAPI app on port 8000; this file is for teams
 * standardizing on Passport in a separate Node service if needed.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;

const GOOGLE_SCOPES = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.modify",
];

function configurePassport(findOrCreateUser) {
  passport.serializeUser((user, done) => {
    done(null, user);
  });
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        callbackURL:
          process.env.GOOGLE_REDIRECT_URI ||
          "http://localhost:8000/api/auth/google/callback",
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUser("google", {
            profile,
            accessToken,
            refreshToken,
          });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID || "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        callbackURL:
          process.env.GITHUB_REDIRECT_URI ||
          "http://localhost:8000/api/auth/github/callback",
        scope: ["user", "repo"],
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUser("github", {
            profile,
            accessToken,
            refreshToken,
          });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

module.exports = {
  passport,
  configurePassport,
  GOOGLE_SCOPES,
};
