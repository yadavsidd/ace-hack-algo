import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Plus, 
  ShoppingBag, 
  Tag, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Package,
  Filter,
  Image as ImageIcon,
  Loader2,
  ExternalLink
} from "lucide-react";
import { 
  Product, 
  Order, 
  getProducts, 
  createProduct, 
  getMyListings, 
  getMyOrders,
  createOrder,
  confirmOrder,
  algodClient,
  peraWallet,
  formatAlgo
} from "../services/algorandService";
import algosdk from "algosdk";
import { cn } from "../lib/utils";

interface MarketplaceProps {
  accountAddress: string;
  onRefreshBalance: () => void;
}

export default function Marketplace({ accountAddress, onRefreshBalance }: MarketplaceProps) {
  const [activeSubTab, setActiveSubTab] = useState<"browse" | "sell" | "my-listings" | "my-orders">("browse");
  const [products, setProducts] = useState<Product[]>([]);
  const [myListings, setMyListings] = useState<Product[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Sell Form State
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("Electronics");
  const [newImage, setNewImage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Checkout State
  const [isBuying, setIsBuying] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<string>("");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allProducts, listings, orders] = await Promise.all([
        getProducts(),
        getMyListings(accountAddress),
        getMyOrders(accountAddress)
      ]);
      setProducts(allProducts);
      setMyListings(listings);
      setMyOrders(orders);
    } catch (error) {
      console.error("Failed to load marketplace data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [accountAddress]);

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountAddress) {
      alert("Please connect your wallet first to create a listing.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createProduct({
        name: newName,
        description: newDesc,
        price: parseFloat(newPrice),
        seller_address: accountAddress,
        image_url: newImage || `https://picsum.photos/seed/${newName}/400/300`,
        category: newCategory
      });
      setNewName("");
      setNewDesc("");
      setNewPrice("");
      setNewImage("");
      setActiveSubTab("my-listings");
      loadData();
    } catch (error) {
      alert("Failed to create listing");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBuy = async (product: Product) => {
    if (!accountAddress) {
      alert("Please connect your wallet first.");
      return;
    }

    if (product.seller_address === accountAddress) {
      alert("You cannot buy your own item!");
      return;
    }

    console.log("Starting purchase for product:", product.id, product.name);
    setIsBuying(product.id);
    setPurchaseStatus("Initializing...");
    
    try {
      // 1. Get Network Params
      setPurchaseStatus("Fetching network params...");
      console.log("Fetching transaction parameters...");
      const suggestedParams = await algodClient.getTransactionParams().do();
      
      // 2. Construct Transaction
      const amountInMicroAlgos = Math.round(Number(product.price) * 1_000_000);
      console.log(`Creating payment of ${amountInMicroAlgos} microAlgos to ${product.seller_address}`);
      
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: accountAddress,
        receiver: product.seller_address.trim(),
        amount: BigInt(amountInMicroAlgos),
        suggestedParams: suggestedParams,
      });

      // 3. Sign Transaction
      setPurchaseStatus("Waiting for signature...");
      console.log("Requesting signature from Pera Wallet...");
      const singleTxnGroups = [{ txn, signers: [accountAddress] }];
      const signedTxns = await peraWallet.signTransaction([singleTxnGroups]);
      
      // 4. Send Transaction
      setPurchaseStatus("Broadcasting transaction...");
      console.log("Sending transaction to network...");
      const response = await algodClient.sendRawTransaction(signedTxns).do();
      const txId = (response as any).txId || (response as any).txid;
      console.log("Transaction sent successfully. ID:", txId);
      
      // 5. Wait for Confirmation
      setPurchaseStatus("Confirming on-chain...");
      console.log("Waiting for network confirmation...");
      await algosdk.waitForConfirmation(algodClient, txId, 4);
      console.log("Transaction confirmed on-chain.");
      
      // 6. Update Backend
      setPurchaseStatus("Finalizing order...");
      console.log("Recording order in database...");
      await createOrder({
        product_id: product.id,
        buyer_address: accountAddress,
        seller_address: product.seller_address,
        amount: Number(product.price),
        tx_id: txId
      });

      console.log("Purchase flow complete!");
      setPurchaseStatus("Success!");
      alert("Purchase successful! Your item is now in 'My Orders'.");
      onRefreshBalance();
      loadData();
    } catch (error: any) {
      console.error("Purchase failed with error:", error);
      setPurchaseStatus("Failed");
      
      let errorMessage = "Purchase failed. ";
      if (error?.message) {
        errorMessage += error.message;
      } else if (typeof error === 'string') {
        errorMessage += error;
      } else {
        errorMessage += "Please check your wallet and balance.";
      }
      
      alert(errorMessage);
    } finally {
      setIsBuying(null);
    }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    setIsConfirming(orderId);
    try {
      await confirmOrder(orderId, accountAddress);
      alert("Receipt confirmed! Thank you for shopping.");
      loadData();
    } catch (error: any) {
      alert(error.message || "Failed to confirm receipt");
    } finally {
      setIsConfirming(null);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Marketplace Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">Campus Marketplace</h2>
          <p className="text-zinc-500">Buy and sell items within the student community using ALGO.</p>
        </div>
        <div className="flex p-1 bg-zinc-100 rounded-2xl self-start">
          {(["browse", "sell", "my-listings", "my-orders"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize",
                activeSubTab === tab 
                  ? "bg-white text-zinc-900 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              {tab.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === "browse" && (
          <motion.div
            key="browse"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, books, electronics..."
                className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-medium"
              />
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                <p>Loading marketplace...</p>
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((product) => (
                  <div key={product.id} className="bg-white border border-zinc-200 rounded-3xl overflow-hidden group hover:shadow-xl hover:shadow-zinc-900/5 transition-all">
                    <div className="aspect-[4/3] relative overflow-hidden">
                      <img 
                        src={product.image_url} 
                        alt={product.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-zinc-900 uppercase tracking-widest">
                        {product.category}
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="space-y-1">
                        <h4 className="font-bold text-zinc-900 text-lg truncate">{product.name}</h4>
                        <p className="text-sm text-zinc-500 line-clamp-2 min-h-[40px]">{product.description}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-zinc-900">{product.price}</span>
                          <span className="text-xs font-bold text-zinc-400">ALGO</span>
                        </div>
                        <button 
                          onClick={() => handleBuy(product)}
                          disabled={isBuying === product.id}
                          className="px-6 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isBuying === product.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-[10px]">{purchaseStatus}</span>
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-4 h-4" />
                              Buy Now
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white border border-zinc-200 rounded-[2.5rem] space-y-4">
                <Package className="w-16 h-16 text-zinc-100 mx-auto" />
                <div className="space-y-1">
                  <p className="font-bold text-zinc-900">No products found</p>
                  <p className="text-sm text-zinc-400">Try adjusting your search or check back later.</p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeSubTab === "sell" && (
          <motion.div
            key="sell"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="max-w-2xl mx-auto bg-white border border-zinc-200 rounded-[2.5rem] p-8 md:p-12 shadow-sm space-y-8"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                <Tag className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">List an Item</h3>
              <p className="text-zinc-500">Sell your unused books, electronics, or furniture to other students.</p>
            </div>

            <form onSubmit={handleCreateListing} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Product Name</label>
                <input 
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Calculus Textbook, Sony Headphones"
                  className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-medium"
                  required
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Description</label>
                <textarea 
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Describe the item's condition, features, etc."
                  className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-medium min-h-[120px]"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Price (ALGO)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                <select 
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-medium appearance-none bg-white"
                >
                  <option>Electronics</option>
                  <option>Books</option>
                  <option>Furniture</option>
                  <option>Clothing</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Image URL (Optional)</label>
                <input 
                  type="url"
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-medium"
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="md:col-span-2 py-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold transition-all shadow-xl shadow-zinc-900/20 flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
              >
                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                {isSubmitting ? "Creating Listing..." : "Create Listing"}
              </button>
            </form>
          </motion.div>
        )}

        {activeSubTab === "my-listings" && (
          <motion.div
            key="my-listings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-zinc-900">Your Listings</h3>
              <button 
                onClick={() => setActiveSubTab("sell")}
                className="flex items-center gap-2 text-sm font-bold text-zinc-900 hover:underline"
              >
                <Plus className="w-4 h-4" /> Add New
              </button>
            </div>

            <div className="bg-white border border-zinc-200 rounded-[2rem] overflow-hidden shadow-sm">
              {myListings.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {myListings.map(product => (
                    <div key={product.id} className="p-6 flex items-center gap-6 hover:bg-zinc-50 transition-all">
                      <img 
                        src={product.image_url} 
                        alt={product.name} 
                        className="w-20 h-20 rounded-2xl object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-zinc-900 truncate">{product.name}</h4>
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                            product.status === 'available' ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                          )}>
                            {product.status}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500">{product.category} • Listed on {new Date(product.created_at).toLocaleDateString()}</p>
                        <p className="text-sm font-bold text-zinc-900">{product.price} ALGO</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                  <Package className="w-12 h-12 text-zinc-200" />
                  <p className="text-sm text-zinc-400">You haven't listed any items yet.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === "my-orders" && (
          <motion.div
            key="my-orders"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <h3 className="text-xl font-bold text-zinc-900">Order History</h3>
            
            <div className="bg-white border border-zinc-200 rounded-[2rem] overflow-hidden shadow-sm">
              {myOrders.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {myOrders.map(order => {
                    const isBuyer = order.buyer_address === accountAddress;
                    return (
                      <div key={order.id} className="p-6 flex items-center gap-6 hover:bg-zinc-50 transition-all">
                        <img 
                          src={order.image_url} 
                          alt={order.product_name} 
                          className="w-20 h-20 rounded-2xl object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <h4 className="font-bold text-zinc-900 truncate">{order.product_name}</h4>
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                {isBuyer ? `Bought from ${order.seller_address.slice(0, 8)}...` : `Sold to ${order.buyer_address.slice(0, 8)}...`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-zinc-900">{order.amount} ALGO</p>
                              <div className="flex items-center gap-1 text-emerald-500">
                                <CheckCircle2 className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">{order.status}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <div className="flex items-center gap-4">
                              <p className="text-xs text-zinc-400">{new Date(order.created_at).toLocaleDateString()}</p>
                              {isBuyer && order.status === 'paid' && (
                                <button 
                                  onClick={() => handleConfirmReceipt(order.id)}
                                  disabled={isConfirming === order.id}
                                  className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-1 disabled:opacity-50"
                                >
                                  {isConfirming === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />}
                                  Confirm Receipt
                                </button>
                              )}
                            </div>
                            <a 
                              href={`https://testnet.explorer.perawallet.app/tx/${order.tx_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-bold text-zinc-300 hover:text-zinc-900 transition-colors"
                            >
                              View Transaction <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                  <ShoppingBag className="w-12 h-12 text-zinc-200" />
                  <p className="text-sm text-zinc-400">No orders found.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
