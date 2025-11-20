# GoComet Bidder System Documentation

## Overview

The GoComet Bidder is an intelligent bidding automation system that handles both **single cargo** and **multiple cargo type** enquiries. The system automatically submits strategic bids at optimal timing to maximize winning chances while allowing users to set different prices for different cargo types.

## System Architecture

### Core Components

1. **Server (Node.js + Express)** - `server.js`
2. **Admin Dashboard** - `dashboard.html` + `dashboard.js`
3. **Public Portal** - `enquiry.html` + `enquiry.js`
4. **Configuration** - `web_config.json`
5. **Styling** - `styles.css`

## Multi-Cargo Type Support

### Problem Solved
Previously, the system treated multiple cargo types (e.g., 40FT and 20FT containers) as a single uniform unit price. Users couldn't specify different prices for different cargo types, which limited bidding strategy flexibility.

### Solution Implemented
The system now supports **individual pricing per cargo type**:

- **40FT containers**: User can set specific price per unit
- **20FT containers**: User can set different price per unit  
- **Any cargo type**: Each gets its own pricing inputs

## Data Flow & Structure

### 1. Sample Data Structure (Multiple Cargo Types)

From `query_multiple.json`:
```json
{
  "freight_charges_custom_charge_40ft_(lxwxh_-_40'x8'x8'8\")_22_ton": {
    "units": 5.0,
    "display_name": "Freight Charges 40FT (LxWXH - 40'x8'x8'8\") 22 Ton Truck",
    "unit_name": "TRUCK TON 22 40'X8'X8'8\") - (LXWXH 40FT"
  },
  "freight_charges_custom_charge_20ftodc_(lxwxh_-_20'x8'x8'8\")_10_ton": {
    "units": 1.0,
    "display_name": "Freight Charges 20FTODC (LxWXH - 20'x8'x8'8\") 10 Ton Truck",
    "unit_name": "TRUCK TON 10 20'X8'X8'8\") - (LXWXH 20FTODC"
  }
}
```

### 2. User Input Structure

#### Single Cargo Type:
```json
{
  "high": 15000,
  "medium": 12000, 
  "low": 10000
}
```

#### Multiple Cargo Types:
```json
{
  "cargo": [
    {
      "cargoIndex": 0,
      "high": 16000,
      "medium": 14000,
      "low": 12000,
      "cargoType": "40FT containers",
      "units": 5
    },
    {
      "cargoIndex": 1, 
      "high": 11000,
      "medium": 9000,
      "low": 7000,
      "cargoType": "20FT containers",
      "units": 1
    }
  ]
}
```

## Key Functions & Logic

### 1. Unit Details Extraction (`/api/quotes` endpoint)

**Location**: `server.js:271-307`

Fetches quote data and extracts unit details for each enquiry. The system identifies freight charge keys that start with `freight_charges_custom_charge` and builds unit details for UI display.

### 2. Bid Payload Preparation (`prepareBidPayload` function)

**Location**: `server.js:1555-1637`

**Key Logic**:
- **Single Cargo**: Applies uniform price across all charges
- **Multiple Cargo**: Uses cargo-specific pricing for each charge type

The function now accepts a third parameter `cargoSpecificPrices` to handle individual cargo type pricing.

### 3. Smart Bidding Strategy

**Location**: `server.js:1818-1865`

**Timing Strategy**:
- **HIGH bid**: Submitted when d9 seconds remaining
- **MEDIUM bid**: Submitted when not rank 1 and >2 seconds remaining  
- **LOW bid**: Submitted in last 2 seconds if still not rank 1

**Multi-Cargo Handling**:
The system determines bid prices based on single or multi-cargo structure, using the first cargo type's prices for timing decisions while maintaining separate pricing for each cargo type.

## User Interface Components

### 1. Admin Dashboard (`dashboard.html` + `dashboard.js`)

**Single Cargo Display**:
- Shows standard High/Medium/Low inputs
- Single "Quantity" field showing cargo summary

**Multiple Cargo Display**:  
- Shows separate bid input sections for each cargo type
- Each section has High/Medium/Low inputs  
- Clear labeling showing cargo type, units, and unit names
- Information box explaining multi-cargo pricing

### 2. Public Portal (`enquiry.html` + `enquiry.js`)

**Single Cargo**:
- Single "Market Rate (¹ per unit)" input
- Shows total units in hint

**Multiple Cargo**:
- Separate input for each cargo type
- Labels clearly show cargo type and quantity
- Validation ensures all cargo types have valid prices

## API Endpoints

### 1. `/api/quotes` (GET)
**Purpose**: Fetch all open enquiries with unit details
**Returns**: Array of quotes with `unit_details` for multi-cargo support

### 2. `/api/public/submit-market-price` (POST)
**Purpose**: Submit market prices from public portal
**Supports**:
- Single cargo: `{ enquiryKey, marketValue }`
- Multi-cargo: `{ enquiryKey, cargoValues: [...], isMultiCargo: true }`

### 3. `/api/start-bidding` (POST) 
**Purpose**: Start smart bidding from admin dashboard
**Supports**:
- Single cargo: `{ enquiryKey, bids: { high, medium, low } }`
- Multi-cargo: `{ enquiryKey, bids: { cargo: [...] } }`

## Configuration

### Price Percentages (`web_config.json`)
```json
{
  "pricePercents": {
    "high": 9,    // 9% above market value
    "medium": 7,  // 7% above market value  
    "low": 5      // 5% above market value
  }
}
```

These percentages are applied to each cargo type's market value independently.

## Error Handling & Validation

### Client-Side Validation
- **Single Cargo**: Ensures market value > 0
- **Multi-Cargo**: Ensures all cargo types have valid prices > 0
- Real-time validation disables submit button until all fields valid

### Server-Side Validation  
- Validates bid structure (single vs multi-cargo)
- Ensures all required bid values present for each cargo type
- Prevents duplicate bid submissions
- Handles missing or invalid cargo pricing gracefully

## Pricing Calculation Examples

### Single Cargo Example:
- Market Value: ¹10,000 per unit
- Total Units: 6 (across all cargo types)  
- HIGH bid: ¹10,900 per unit × 6 units = ¹65,400 total
- Distributed equally across all cargo types by unit count

### Multi-Cargo Example:
- **40FT**: Market ¹15,000/unit × 5 units = ¹75,000 for 40FT
- **20FT**: Market ¹8,000/unit × 1 unit = ¹8,000 for 20FT  
- **HIGH bids**: 40FT @ ¹16,350/unit, 20FT @ ¹8,720/unit
- Each cargo type calculated independently

## System Benefits

### 1. **Flexibility**
- Users can set competitive prices for different cargo types
- Better strategic control over mixed cargo enquiries

### 2. **Accuracy**  
- Proper pricing distribution based on actual cargo requirements
- No more uniform pricing across different cargo types

### 3. **Transparency**
- Clear UI showing exactly what user is bidding on
- Detailed breakdown of units and charges

### 4. **Backward Compatibility**
- Single cargo enquiries work exactly as before
- No changes required for existing single-cargo workflows

## Future Enhancements

1. **Cargo Type Templates**: Save common cargo pricing patterns
2. **Bulk Price Updates**: Update multiple cargo types simultaneously  
3. **Advanced Timing**: Different timing strategies per cargo type
4. **Price Optimization**: AI-suggested optimal pricing per cargo type
5. **Analytics**: Success rates per cargo type combination

## Troubleshooting

### Common Issues

1. **"Invalid cargo values for multi-cargo enquiry"**
   - Ensure all cargo types have valid prices > 0
   - Check that cargoValues array is properly structured

2. **"No price found for cargo index"**
   - Cargo index mismatch between UI and server
   - Refresh page and retry bid submission

3. **Bid submission fails with multi-cargo**
   - Check server logs for prepareBidPayload errors
   - Verify freight charges structure matches expected format

### Debug Information

Enable detailed logging by checking server console output:
- `[PREPARE BID]` logs show cargo-specific price calculations
- `[QUOTES API]` logs show unit details extraction  
- `[START-BIDDING]` logs show bid validation results

---

**Created by Saksham Solanki** - This comprehensive system ensures accurate, flexible, and strategic bidding across all cargo type combinations while maintaining the intelligent timing and automation features of the original system.
- never test anything, lemme test it