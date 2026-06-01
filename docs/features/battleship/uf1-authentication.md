# UF1: Authentication

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

The entry gate to the application. All game screens require an authenticated user; there is
no guest play. Uses Django's built-in authentication.

## Specification

AAU (anonymous visitor), navigating to the site, I see/can:
- A login form (username/email + password) and a link to register.
- Register a new account (username, password, confirmation).
- Log in with valid credentials and land on the authenticated home (UF2).
- Log out from any authenticated page.

## Success Scenario

- AAU with valid credentials, submitting the login form, I am authenticated and redirected
  to the home screen.
- AAU completing registration, I am logged in and redirected to the home screen.

## Error Scenario

- AAU with invalid credentials, I see an inline error and remain on the login form.
- AAU registering with a taken username or mismatched password confirmation, I see a
  field-level error and can correct it.

## Edge Cases

- AAU requesting any game URL while unauthenticated, I am redirected to login and (ideally)
  returned to the original URL after authenticating.

## Acceptance Criteria

- [ ] An unauthenticated request to any game screen redirects to the login page.
- [ ] A user can register, and is logged in immediately afterward.
- [ ] Valid login redirects to the home screen; invalid login shows an error.
- [ ] Logout is available on authenticated pages and ends the session.
