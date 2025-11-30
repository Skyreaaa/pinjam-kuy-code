// Centralized API base URL
// Priority:
// 1. Explicit env (REACT_APP_API_BASE_URL)
// 2. If running on a non-localhost host (e.g. opened via 192.168.x.x on phone), reuse that host with backend port 5000
// 3. Fallback to http://localhost:5000/api

function resolveDefaultBase(): string {
	if (typeof window !== 'undefined') {
		const { hostname, origin } = window.location;
		const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
		// In production or any non-localhost host, prefer same-origin '/api'
		if (!isLocalhost) return `${origin}/api`;
	}
	// Local development: default to local backend
	return 'http://localhost:5000/api';
}

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || resolveDefaultBase();

// Helper to build full URL
export const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`;

// Debug (development only)
if (process.env.NODE_ENV !== 'production') {
	// eslint-disable-next-line no-console
	console.log('[API] Base URL resolved to:', API_BASE_URL);
}
