import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

// TypeScript interfaces for our data structures
interface OrderItem {
	itemID: string;
	quantity: number;
	soldPrice: number;
	discountedPercentage?: number;
}

interface CreateOrderDTO {
	branchID: string;
	orderType: string;
	orderNote?: string;
	paymentType: string;
	items: OrderItem[];
}

interface ResponseOrderItemDTO {
	orderItemID: string;
	itemID: string;
	itemName: string;
	soldPrice: number;
	discountedPercentage?: number;
	taxedPercentage: number;
	quantity: number;
}

interface ResponseOrderDTO {
	orderID: string;
	branchID: string;
	orderNumber: number;
	orderType: string;
	orderStatus: string;
	orderNote?: string;
	orderCancelMessage?: string;
	paymentType: string;
	totalPrice: number;
	isPaid: boolean;
	createdAt: string;
	items: ResponseOrderItemDTO[];
}

interface UpdateOrderStatusDTO {
	orderID: string;
	orderStatus: string;
}

const HomeView: React.FC = () => {
	// State
	const [branchId, setBranchId] = useState<string>("");
	const [isConnected, setIsConnected] = useState<boolean>(false);
	const [orders, setOrders] = useState<ResponseOrderDTO[]>([]);
	const [connectionMessages, setConnectionMessages] = useState<string[]>([]);
	const [newOrder, setNewOrder] = useState<CreateOrderDTO>({
		branchID: "",
		orderType: "Dine-in",
		orderNote: "",
		paymentType: "Cash",
		items: [],
	});

	// For the new item in the order form
	const [newItem, setNewItem] = useState<OrderItem>({
		itemID: "",
		quantity: 1,
		soldPrice: 0,
	});

	// WebSocket reference
	const socketRef = useRef<WebSocket | null>(null);

	// API URL
	const API_URL = "https://aroided-pos-api-dev.azurewebsites.net"; // Update with your API URL

	// Connect to WebSocket
	const connectWebSocket = () => {
		if (!branchId) {
			alert("Please enter a Branch ID");
			return;
		}

		try {
			// Close existing connection if any
			if (socketRef.current) {
				socketRef.current.close();
			}

			const wsUrl = `${API_URL.replace("https://", "wss://").replace(
				"http://",
				"ws://"
			)}/ws/orders?branchId=${branchId}`;
			addConnectionMessage(`Connecting to ${wsUrl}...`);

			socketRef.current = new WebSocket(wsUrl);

			socketRef.current.onopen = () => {
				setIsConnected(true);
				addConnectionMessage("Connected to WebSocket server");

				// Send ping every 30 seconds
			};

			socketRef.current.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					addConnectionMessage(`Received: ${data.type}`);

					console.log("Received message:", data);
					switch (data.type) {
						case "new_order":
							handleNewOrder(data.data);
							break;
						case "status_changed":
							console.log("Status changed:", data.data);
							handleStatusChange(data.data);
							break;
						case "connection":
							addConnectionMessage(
								`Connection established. ID: ${data.connectionId}`
							);
							break;
						case "pong":
							console.log("Ping-pong: Connection alive");
							break;
						default:
							console.log("Unknown message type:", data.type);
					}
				} catch (err) {
					console.error("Error parsing WebSocket message:", err);
				}
			};

			socketRef.current.onclose = () => {
				setIsConnected(false);
				addConnectionMessage("Disconnected from WebSocket server");
			};

			socketRef.current.onerror = (error) => {
				setIsConnected(false);
				addConnectionMessage(`WebSocket error: ${error.type}`);
			};
		} catch (err) {
			console.error("Failed to connect to WebSocket:", err);
			setIsConnected(false);
		}
	};

	// Helper function to add messages to the connection log
	const addConnectionMessage = (message: string) => {
		setConnectionMessages((prev) => [
			...prev,
			`[${new Date().toLocaleTimeString()}] ${message}`,
		]);
	};

	// Handle new order from WebSocket
	const handleNewOrder = (order: ResponseOrderDTO) => {
		setOrders((prev) => {
			// Check if order already exists
			if (prev.some((o) => o.orderID === order.orderID)) {
				return prev.map((o) => (o.orderID === order.orderID ? order : o));
			}
			// Add new order
			return [...prev, order];
		});
	};

	// Handle order status change from WebSocket
	const handleStatusChange = (updatedOrder: ResponseOrderDTO) => {
		setOrders((prev) =>
			prev.map((order) =>
				order.orderID === updatedOrder.orderID ? updatedOrder : order
			)
		);
	};

	// Fetch orders on component mount or when branchId changes
	useEffect(() => {
		if (branchId) {
			fetchOrders();
		}
	}, [branchId]);

	// Clean up WebSocket on component unmount
	useEffect(() => {
		return () => {
			if (socketRef.current) {
				socketRef.current.close();
			}
		};
	}, []);

	// Fetch orders from API
	const fetchOrders = async () => {
		try {
			const response = await axios.get(
				`${API_URL}/api/v1/Order/GetOrdersByBranchId/${branchId}`
			);

			if (response.data.response === 200) {
				setOrders(response.data.data || []);
				addConnectionMessage(`Fetched ${response.data.data.length} orders`);
			} else {
				console.error("Error fetching orders:", response.data.message);
			}
		} catch (error) {
			console.error("Error fetching orders:", error);
		}
	};

	// Create a new order
	const createOrder = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!branchId || !newOrder.items.length) {
			alert("Please enter branch ID and at least one item");
			return;
		}

		try {
			// Set the branch ID from the current state
			const orderToCreate = {
				...newOrder,
				branchID: branchId,
			};

			const response = await axios.post(
				`${API_URL}/api/v1/Order/CreateOrder`,
				orderToCreate
			);

			if (response.data.response === 200) {
				addConnectionMessage("Order created successfully");

				// Reset the form
				setNewOrder({
					branchID: branchId,
					orderType: "Dine-in",
					orderNote: "",
					paymentType: "Cash",
					items: [],
				});
			} else {
				addConnectionMessage(`Error creating order: ${response.data.message}`);
			}
		} catch (error) {
			console.error("Error creating order:", error);
			addConnectionMessage(`Error creating order: ${(error as Error).message}`);
		}
	};

	// Add an item to the order form
	const addItemToOrder = () => {
		if (!newItem.itemID || newItem.quantity < 1 || newItem.soldPrice <= 0) {
			alert("Please fill in all item fields with valid values");
			return;
		}

		setNewOrder((prev) => ({
			...prev,
			items: [...prev.items, newItem],
		}));

		// Reset the new item form
		setNewItem({
			itemID: "",
			quantity: 1,
			soldPrice: 0,
		});
	};

	// Update order status
	const updateOrderStatus = async (orderID: string, newStatus: string) => {
		try {
			const updateData: UpdateOrderStatusDTO = {
				orderID,
				orderStatus: newStatus,
			};

			const response = await axios.put(
				`${API_URL}/api/v1/Order/UpdateOrderStatus`,
				updateData
			);

			if (response.data.response === 200) {
				addConnectionMessage(`Order ${orderID} status updated to ${newStatus}`);
			} else {
				addConnectionMessage(
					`Error updating order status: ${response.data.message}`
				);
			}
		} catch (error) {
			console.error("Error updating order status:", error);
			addConnectionMessage(
				`Error updating status: ${(error as Error).message}`
			);
		}
	};

	// Render the component
	return (
		<div className="p-5 max-w-7xl mx-auto">
			<h1 className="text-2xl font-bold mb-4">Order System WebSocket Test</h1>

			{/* Connection Controls */}
			<div className="p-4 mb-5 border border-gray-300 rounded-md bg-gray-50">
				<h2 className="text-xl font-semibold mb-3">Connection</h2>
				<div className="flex gap-3 mb-3">
					<input
						type="text"
						placeholder="Branch ID"
						value={branchId}
						onChange={(e) => setBranchId(e.target.value)}
						className="flex-1 p-2 border border-gray-300 rounded-md"
					/>
					<button
						onClick={connectWebSocket}
						disabled={isConnected}
						className={`px-4 py-2 rounded-md text-white ${
							isConnected
								? "bg-gray-400 cursor-default"
								: "bg-green-500 cursor-pointer hover:bg-green-600"
						}`}
					>
						{isConnected ? "Connected" : "Connect"}
					</button>
					<button
						onClick={() => {
							if (socketRef.current) {
								socketRef.current.close();
								addConnectionMessage("Manually disconnected");
							}
						}}
						disabled={!isConnected}
						className={`px-4 py-2 rounded-md text-white ${
							!isConnected
								? "bg-gray-400 cursor-default"
								: "bg-red-500 cursor-pointer hover:bg-red-600"
						}`}
					>
						Disconnect
					</button>
					<button
						onClick={fetchOrders}
						className="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer hover:bg-blue-600"
					>
						Refresh Orders
					</button>
				</div>

				{/* Connection status */}
				<div
					className={`p-3 rounded-md mb-3 ${
						isConnected ? "bg-green-50" : "bg-red-50"
					}`}
				>
					Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
				</div>

				{/* Connection log */}
				<div className="h-24 overflow-y-auto border border-gray-300 p-3 bg-white rounded-md text-xs font-mono">
					{connectionMessages.map((msg, index) => (
						<div key={index}>{msg}</div>
					))}
				</div>
			</div>

			{/* Create Order Form */}
			<div className="p-4 mb-5 border border-gray-300 rounded-md bg-gray-50">
				<h2 className="text-xl font-semibold mb-3">Create New Order</h2>
				<form onSubmit={createOrder}>
					<div className="flex gap-3 mb-3">
						<select
							value={newOrder.orderType}
							onChange={(e) =>
								setNewOrder({ ...newOrder, orderType: e.target.value })
							}
							className="flex-1 p-2 border border-gray-300 rounded-md"
						>
							<option value="Dine-in">Dine-in</option>
							<option value="Takeaway">Takeaway</option>
							<option value="Delivery">Delivery</option>
						</select>

						<select
							value={newOrder.paymentType}
							onChange={(e) =>
								setNewOrder({ ...newOrder, paymentType: e.target.value })
							}
							className="flex-1 p-2 border border-gray-300 rounded-md"
						>
							<option value="Cash">Cash</option>
							<option value="Card">Card</option>
							<option value="Mobile">Mobile Payment</option>
						</select>
					</div>

					<div className="mb-3">
						<textarea
							placeholder="Order Notes"
							value={newOrder.orderNote || ""}
							onChange={(e) =>
								setNewOrder({ ...newOrder, orderNote: e.target.value })
							}
							className="w-full p-2 min-h-[60px] border border-gray-300 rounded-md"
						/>
					</div>

					{/* Item list in the current order */}
					<div className="mb-4">
						<h3 className="text-lg font-medium mb-2">Order Items</h3>
						{newOrder.items.length === 0 ? (
							<div className="p-3 bg-orange-50 rounded-md">
								No items added yet. Add items below.
							</div>
						) : (
							<table className="w-full border-collapse">
								<thead>
									<tr className="bg-gray-200">
										<th className="p-2 text-left">Item ID</th>
										<th className="p-2 text-right">Quantity</th>
										<th className="p-2 text-right">Price</th>
										<th className="p-2 text-right">Discount %</th>
										<th className="p-2 text-right">Total</th>
									</tr>
								</thead>
								<tbody>
									{newOrder.items.map((item, index) => (
										<tr key={index} className="border-b border-gray-300">
											<td className="p-2">{item?.itemID}</td>
											<td className="p-2 text-right">{item?.quantity}</td>
											<td className="p-2 text-right">
												${item.soldPrice?.toFixed(2)}
											</td>
											<td className="p-2 text-right">
												{item.discountedPercentage || 0}%
											</td>
											<td className="p-2 text-right">
												$
												{(
													item.quantity *
													item.soldPrice *
													(1 - (item.discountedPercentage || 0) / 100)
												)?.toFixed(2)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>

					{/* Add new item form */}
					<div className="flex gap-3 mb-4 p-3 bg-gray-100 rounded-md">
						<input
							type="text"
							placeholder="Item ID"
							value={newItem.itemID}
							onChange={(e) =>
								setNewItem({ ...newItem, itemID: e.target.value })
							}
							className="flex-2 p-2 border border-gray-300 rounded-md"
						/>
						<input
							type="number"
							placeholder="Quantity"
							min="1"
							value={newItem.quantity}
							onChange={(e) =>
								setNewItem({
									...newItem,
									quantity: parseInt(e.target.value) || 1,
								})
							}
							className="flex-1 p-2 border border-gray-300 rounded-md"
						/>
						<input
							type="number"
							placeholder="Price"
							step="0.01"
							min="0"
							value={newItem.soldPrice}
							onChange={(e) =>
								setNewItem({
									...newItem,
									soldPrice: parseFloat(e.target.value) || 0,
								})
							}
							className="flex-1 p-2 border border-gray-300 rounded-md"
						/>
						<input
							type="number"
							placeholder="Discount %"
							min="0"
							max="100"
							value={newItem.discountedPercentage || ""}
							onChange={(e) =>
								setNewItem({
									...newItem,
									discountedPercentage: parseFloat(e.target.value) || undefined,
								})
							}
							className="flex-1 p-2 border border-gray-300 rounded-md"
						/>
						<button
							type="button"
							onClick={addItemToOrder}
							className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
						>
							Add Item
						</button>
					</div>

					<button
						type="submit"
						disabled={!isConnected || newOrder.items.length === 0}
						className={`w-full py-3 px-5 rounded-md text-white ${
							!isConnected || newOrder.items.length === 0
								? "bg-gray-400"
								: "bg-green-500 hover:bg-green-600"
						} ${
							!isConnected || newOrder.items.length === 0
								? "cursor-default"
								: "cursor-pointer"
						}`}
					>
						Create Order
					</button>
				</form>
			</div>

			{/* Orders List */}
			<div className="p-4 border border-gray-300 rounded-md">
				<h2 className="text-xl font-semibold mb-3">Orders</h2>
				{orders.length === 0 ? (
					<div className="p-5 text-center bg-gray-50">
						No orders found. Connect to a branch and create an order.
					</div>
				) : (
					<div className="grid gap-4">
						{orders.map((order) => (
							<div
								key={order.orderID}
								className={`border border-gray-300 rounded-md p-4
                ${
									order.orderStatus === "Pending"
										? "bg-orange-50"
										: order.orderStatus === "Preparing"
										? "bg-blue-50"
										: order.orderStatus === "Ready"
										? "bg-green-50"
										: order.orderStatus === "Completed"
										? "bg-teal-50"
										: order.orderStatus === "Cancelled"
										? "bg-red-50"
										: "bg-gray-50"
								}`}
							>
								<div className="flex justify-between mb-3">
									<h3 className="text-lg font-medium">
										Order #{order.orderNumber}
									</h3>
									<div
										className={`px-2 py-1 rounded text-xs font-bold text-white
                    ${
											order.orderStatus === "Pending"
												? "bg-orange-500"
												: order.orderStatus === "Preparing"
												? "bg-blue-500"
												: order.orderStatus === "Ready"
												? "bg-green-500"
												: order.orderStatus === "Completed"
												? "bg-teal-500"
												: order.orderStatus === "Cancelled"
												? "bg-red-500"
												: "bg-gray-500"
										}`}
									>
										{order.orderStatus}
									</div>
								</div>

								<div className="flex gap-3 mb-3 text-sm text-gray-600">
									<div>Type: {order.orderType}</div>
									<div>|</div>
									<div>Payment: {order.paymentType}</div>
									<div>|</div>
									<div>Total: ${order.totalPrice?.toFixed(2)}</div>
									<div>|</div>
									<div>Paid: {order.isPaid ? "Yes" : "No"}</div>
								</div>

								{order.orderNote && (
									<div className="mb-3 text-sm">
										<strong>Note:</strong> {order.orderNote}
									</div>
								)}

								<div className="my-4">
									<table className="w-full border-collapse">
										<thead>
											<tr className="bg-gray-200">
												<th className="p-2 text-left">Item</th>
												<th className="p-2 text-right">Qty</th>
												<th className="p-2 text-right">Price</th>
												<th className="p-2 text-right">Discount</th>
												<th className="p-2 text-right">Tax</th>
												<th className="p-2 text-right">Total</th>
											</tr>
										</thead>
										<tbody>
											{order.items?.map((item) => (
												<tr
													key={item.orderItemID}
													className="border-b border-gray-300"
												>
													<td className="p-2">
														{item.itemName || item.itemID}
													</td>
													<td className="p-2 text-right">{item.quantity}</td>
													<td className="p-2 text-right">
														${item.soldPrice?.toFixed(2)}
													</td>
													<td className="p-2 text-right">
														{item.discountedPercentage || 0}%
													</td>
													<td className="p-2 text-right">
														{item.taxedPercentage}%
													</td>
													<td className="p-2 text-right">
														$
														{(
															item.quantity *
															item.soldPrice *
															(1 - (item.discountedPercentage || 0) / 100) *
															(1 + item.taxedPercentage / 100)
														)?.toFixed(2)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>

								<div className="flex gap-3 mt-4">
									<button
										onClick={() => updateOrderStatus(order.orderID, "Pending")}
										className="bg-orange-500 text-white px-3 py-2 rounded text-xs hover:bg-orange-600"
									>
										Pending
									</button>
									<button
										onClick={() =>
											updateOrderStatus(order.orderID, "Preparing")
										}
										className="bg-blue-500 text-white px-3 py-2 rounded text-xs hover:bg-blue-600"
									>
										Preparing
									</button>
									<button
										onClick={() => updateOrderStatus(order.orderID, "Ready")}
										className="bg-green-500 text-white px-3 py-2 rounded text-xs hover:bg-green-600"
									>
										Ready
									</button>
									<button
										onClick={() =>
											updateOrderStatus(order.orderID, "Completed")
										}
										className="bg-teal-500 text-white px-3 py-2 rounded text-xs hover:bg-teal-600"
									>
										Completed
									</button>
									<button
										onClick={() =>
											updateOrderStatus(order.orderID, "Cancelled")
										}
										className="bg-red-500 text-white px-3 py-2 rounded text-xs hover:bg-red-600"
									>
										Cancel
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default HomeView;
