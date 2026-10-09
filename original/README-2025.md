<div align="center">

# Political Data Collection System

Scrape, clean and structure United States campaign documents and debate transcripts from the UC Santa Barbara American Presidency Project.

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Jupyter](https://img.shields.io/badge/Jupyter-Notebook-F37626?logo=jupyter&logoColor=white)](https://jupyter.org/)
[![pandas](https://img.shields.io/badge/pandas-data-150458?logo=pandas&logoColor=white)](https://pandas.pydata.org/)
[![BeautifulSoup](https://img.shields.io/badge/BeautifulSoup4-parsing-43B02A)](https://www.crummy.com/software/BeautifulSoup/)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000)](https://github.com/psf/black)
[![Status](https://img.shields.io/badge/status-research%20dataset-blue)]()

</div>

---

## Overview

This project gathers publicly available political content from [presidency.ucsb.edu](https://www.presidency.ucsb.edu) and turns it into tidy CSV datasets ready for analysis. It is built around two Jupyter notebooks, each handling a different kind of source material.

- **`documents.ipynb`** collects campaign documents: speeches, remarks, statements, interviews and addresses, along with their metadata and full text.
- **`debates.ipynb`** collects presidential and vice presidential debate transcripts, with participants, moderators and venue details pulled out into their own fields.

Everything here is sourced from material that is already public. The scrapers are rate limited and use polite request patterns so they sit lightly on the source server.

## Highlights

- **Two focused collectors** so campaign documents and debates each get extraction logic suited to their page layout.
- **Metadata plus full text** captured in one pass: dates, titles, speakers, document types, word counts and the complete content.
- **Concurrent scraping** with a thread pool to move through paginated results quickly without hammering the server.
- **Resumable runs** via a pickle cache and a JSON checkpoint, so a long collection can stop and pick up where it left off.
- **Date normalisation** that standardises mixed date formats into ISO timestamps.
- **Retry and backoff** built into the HTTP session to ride out the occasional network hiccup.

## Tech Stack

| Layer         | Tool                                                 |
| ------------- | ---------------------------------------------------- |
| Language      | Python 3.9+                                          |
| Environment   | Jupyter Notebook                                     |
| HTTP          | `requests` with retry adapter and connection pooling |
| HTML parsing  | `BeautifulSoup4` (+ `lxml`)                          |
| Data handling | `pandas`                                             |
| Concurrency   | `concurrent.futures.ThreadPoolExecutor`              |
| Progress      | `tqdm`                                               |
| Caching       | `pickle` cache + JSON checkpoint                     |

## Getting Started

### Prerequisites

Install the dependencies:

```bash
pip install jupyter pandas requests beautifulsoup4 lxml tqdm
```

### Running the collectors

Launch Jupyter and open whichever notebook you need:

```bash
jupyter notebook
```

**Campaign documents (`documents.ipynb`)**

1. Run the cells in order. The first pass scrapes document metadata across the paginated category listing and writes `campaign_documents.csv`.
2. The second pass reads that CSV back in and extracts the full text for each document, saving progress to `document_cache.pkl` and `extraction_checkpoint.json` as it goes.
3. If a run is interrupted, just re-run the cells. The checkpoint lets it resume rather than start over.

**Debates (`debates.ipynb`)**

1. Run the cells in order to scrape the debate listing into `debates_data.csv`.
2. The processing cells then pull each transcript apart into participants, moderators and content, writing `debates_data_processed.csv`.

You can tune the worker count, rate-limit delays and page size near the top of each notebook to match your machine and how gently you want to treat the source.

## Datasets

| File                                | What it holds                                                      |
| ----------------------------------- | ------------------------------------------------------------------ |
| `campaign_documents.csv`            | Campaign documents with metadata and full text                     |
| `documents_processed_optimized.csv` | Processed campaign documents                                       |
| `debates_data.csv`                  | Raw debate listing (date, title, links)                            |
| `debates_data_processed.csv`        | Debate transcripts split into participants, moderators and content |

**Campaign document fields** include the URL, publication date (ISO), title, speaker and speaker title, document type, location, full content, word count and extraction status.

**Debate fields** include the date, title, participant and moderator lists, full transcript text and HTML, and video availability.

## Research Applications

The resulting datasets suit a range of political science and computational social science work, such as political speech and rhetoric analysis, tracking how campaign messaging shifts over time, debate analysis, and natural language processing on political text.

## Legal and Ethical Notes

- All data is collected from publicly available sources.
- Rate limiting is in place to keep the load on the source server light.
- The datasets are intended for research and educational use. Please follow the source site's terms of service and any relevant institutional policies.

## License

Intended for research and educational use. Please ensure compliance with relevant institutional policies and the source site's data usage guidelines.
