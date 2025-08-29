# Political Data Collection System

A comprehensive data collection and analysis system for extracting political documents and debate transcripts from the UC Santa Barbara American Presidency Project website.

## Project Overview

This project consists of two main data collection modules designed to systematically gather political content for research and analysis purposes:

1. **Campaign Documents Collection** - Extracts campaign-related documents including speeches, remarks, statements, interviews, and addresses
2. **Debates Collection** - Focuses specifically on presidential and vice presidential debate transcripts with participant identification

## Features

### Campaign Documents Module (`documents.ipynb`)
- Automated extraction of campaign documents from presidency.ucsb.edu
- Metadata collection including publication dates, titles, and classifications
- Full document text content extraction
- Speaker identification and document type classification
- Concurrent processing with threading for improved performance
- Checkpoint system for resumable operations
- Data caching to avoid re-processing existing content

### Debates Module (`debates.ipynb`)
- Specialized extraction of political debate transcripts
- Participant identification and role classification
- Moderator information extraction
- Date normalization and standardized formatting
- Location and venue information capture
- Video content availability detection

## Technical Architecture

### Core Technologies
- **Python 3.x** - Primary programming language
- **Jupyter Notebooks** - Interactive development and documentation
- **BeautifulSoup4** - HTML parsing and content extraction
- **requests** - HTTP client for web scraping
- **pandas** - Data manipulation and analysis
- **ThreadPoolExecutor** - Concurrent processing

### Data Processing Pipeline
1. **Web Scraping** - Systematic extraction from paginated results
2. **Content Processing** - Text cleaning and metadata extraction
3. **Data Validation** - Content verification and error handling
4. **Persistence** - CSV output with UTF-8 encoding
5. **Caching** - Pickle-based storage for performance optimization

## File Structure

```
.
├── documents.ipynb              # Campaign documents collection notebook
├── debates.ipynb                # Debates collection notebook
├── campaign_documents.csv       # Raw campaign documents data
├── documents_processed_optimized.csv  # Processed campaign documents
├── debates_data.csv            # Raw debates data
├── debates_data_processed.csv  # Processed debates data
├── document_cache.pkl          # Cached document data
├── extraction_checkpoint.json  # Progress tracking checkpoint
└── README.md                   # This file
```

## Usage

### Prerequisites
Install required Python packages:
```bash
pip install jupyter pandas requests beautifulsoup4 lxml
```

### Running the Collection Systems

#### Campaign Documents Collection
1. Open `documents.ipynb` in Jupyter Notebook
2. Execute cells sequentially to begin data collection
3. Monitor progress through checkpoint system
4. Output will be saved to CSV files automatically

#### Debates Collection
1. Open `debates.ipynb` in Jupyter Notebook
2. Run cells to extract debate transcripts
3. Processed data will be available in CSV format

### Configuration Options
- **Threading**: Adjust worker thread count for concurrent processing
- **Rate Limiting**: Configure delays between requests
- **Pagination**: Set items per page for collection batches
- **Caching**: Enable/disable caching for performance tuning

## Data Output

### Campaign Documents Schema
- Document ID and URL references
- Publication dates (ISO format)
- Document titles and classifications
- Speaker information and titles
- Document type (Speech, Remarks, Statement, etc.)
- Full text content
- Word count statistics
- Location information

### Debates Schema
- Debate dates and event information
- Participant lists and roles
- Moderator details
- Complete transcript content
- Video availability indicators
- Venue and location data

## Error Handling and Resilience

### Network Resilience
- Automatic retry mechanisms with exponential backoff
- Session-based HTTP requests with connection pooling
- Graceful handling of temporary network issues

### Data Integrity
- Content verification and validation
- Error status tracking for failed extractions
- Checkpoint-based progress recovery
- Duplicate detection and prevention

## Performance Considerations

### Optimization Features
- Concurrent processing with configurable thread pools
- Intelligent caching to avoid redundant requests
- Progress checkpointing for large-scale operations
- Memory-efficient data processing pipelines

### Resource Management
- Rate limiting to respect server resources
- Efficient memory usage for large datasets
- Graceful handling of system interruptions

## Research Applications

This dataset is suitable for various political science and computational social science research applications:

- Political speech analysis and rhetoric studies
- Campaign strategy evolution tracking
- Debate performance analysis
- Historical political document archiving
- Natural language processing on political texts
- Comparative political communication research

## Contributing

When contributing to this project:
1. Maintain the existing code structure and documentation standards
2. Test new features with small data samples before full deployment
3. Update checkpoint and caching mechanisms as needed
4. Ensure compliance with website terms of service and ethical scraping practices

## Legal and Ethical Considerations

- All data is collected from publicly available sources
- Rate limiting implemented to minimize server impact
- Data collection follows ethical web scraping guidelines
- Content is used for research and educational purposes
- Respect for source website terms of service

## License

This project is intended for research and educational use. Please ensure compliance with relevant institutional policies and data usage guidelines.
