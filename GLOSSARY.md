# Hugging App

A catalog of iOS App Store listings rebuilt from Apple's public feeds, plus a small human-reviewed library of interface references.

## Catalog

**Snapshot**:
One published build of the catalog, with its coverage and generation time.
_Avoid_: dataset, data, library

**App**:
An App Store listing that appears in at least one tracked category chart in the current snapshot.
_Avoid_: product, title

**Category**:
An Apple genre whose free chart the catalog tracks.
_Avoid_: genre (except in Apple feed code), section

**Chart rank**:
An app's position in one category's free chart, as Apple reported it. An app has one chart rank per category.
_Avoid_: rank (unqualified), position, popularity

**Coverage**:
The counts a snapshot records about itself: chart entries, resolved apps, screenshots, additions and removals.
_Avoid_: stats, metrics

## Media

**Screenshot**:
A developer-published listing image for one app.
_Avoid_: screen (except as the route and code name), shot, image, media

**Asset**:
A stored media file named by its content hash. A screenshot or an app icon.
_Avoid_: file, upload, attachment

## Reviewed references

**Reviewed library**:
The human-reviewed set of collections and UI elements, pinned so a catalog refresh cannot remove them.
_Avoid_: curation (except as the file name), dataset

**Collection**:
A curator-ordered group of screenshots from one app listing. Its order is unverified.
_Avoid_: flow (the route and code name only), journey, sequence

**UI element**:
One screenshot reviewed for a named, visible interface pattern.
_Avoid_: pattern, component, element (unqualified)

## Visitor actions

**Board**:
The screenshots and collections a visitor has saved. In this release it lives on their device.
_Avoid_: saved board (UI label only), research board, reference board, favourites

**Comparison**:
Two to four screenshots selected for side-by-side review. Selections are not saved.
_Avoid_: selection set, compare list

**Export**:
A JSON file of the records on the current route, with snapshot coverage.
_Avoid_: download, backup

**Reference page**:
A crawlable static HTML page built from the snapshot for one app, UI element or collection.
_Avoid_: SEO page, landing page

## Product names

**Hugging App**:
The catalog site and its brand.
_Avoid_: open-app-catalog (the repo name only), OAC

**Hugging App plugin**:
The separate agent plugin that reviews supplied evidence. It does not fetch the catalog.
_Avoid_: the plugin (unqualified), the agent

## Flagged ambiguities

- The **Flows** route shows **collections**. The label stays until Austin decides on a rename (see STATUS.md).
- The **About & sources** route is keyed `agents` in code. The key stays so existing links keep working.
