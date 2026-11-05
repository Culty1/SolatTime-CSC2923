# SolatTime - CSC2923 OOP Final Assignment

A three-page Electron desktop application built with HTML, CSS and JavaScript.

## Run on Windows

1. Open the folder containing `package.json` directly in VS Code.
2. In a Command Prompt terminal run `npm install` once, then `npm start`.
3. If you are in the outer `SolatTime_4Page_Complete_Project` folder, first run `cd SolatTime`.

## Pages

- Dashboard: live Malaysian clock, state/zone selection, real JAKIM-based prayer times from the Waktu Solat API, next prayer countdown and rule-based activity advice.
- Activity Planner: create, view, edit, complete and delete activities in Local Storage; automatic upcoming Islamic events with Plan actions.
- Analytics: estimated Eid al-Adha and other event countdowns, days between Islamic events, and live API-derived intervals between prayer times.

## Sources

Prayer times: https://api.waktusolat.app/docs (free public API; needs network connection). Prayer zones from `/zones`, daily records from `/v2/solat/{zone}`.

Islamic event dates: built-in JavaScript `Intl.DateTimeFormat('en-u-ca-islamic-umalqura')`, calculated locally. **These dates are estimates** and can differ from official Malaysian moon-sighting announcements. Events display even offline and do not wait for a separate API.

Local activities are stored in Electron's Local Storage. No `node_modules` folder is bundled; `npm install` recreates dependencies.

## Note on existing data

This application preserves records previously stored under `solattime:activities` or `solat_activities` where available. Keep the same project folder and file protocol origin to retain saved records.

## Malaysian Islamic dates

Calendar events are calculated locally and shown immediately, even without network access. For the 2027 public-holiday dates of Aidilfitri (10 March), Aidiladha (17 May), and Awal Muharram (7 June), the app uses widely published **tentative Malaysian dates**, which may differ by one day from the built-in calendar method. All dates remain estimates until official Malaysian announcements. Source: https://www.timeanddate.com/holidays/malaysia/2027 .

## Before submission

Take real screenshots from the Electron application while connected to the Internet and add your actual GitHub repository link to the report. Screenshots in the supplied draft report are labelled simulated tests; replace them with real captures before submission.