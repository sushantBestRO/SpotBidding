export interface BiddingData {
    vendorRank: number;
    bidClosingIn: number;
    revisionsLeft: number;
    bidCloseTime?: string; // ISO string
    biddingClosed?: boolean; // Whether bidding has been closed
}

export interface IBiddingStrategy {
    name: string;

    // Fetch current status of the bid (rank, time left)
    fetchBiddingData(enquiryKey: string, authToken: string): Promise<BiddingData>;

    // Submit a bid
    submitBid(quoteId: string, amount: number, authToken: string): Promise<boolean>;

    // Fetch quote details needed for submission
    getQuoteDetails(enquiryKey: string, authToken: string): Promise<any>;
}
