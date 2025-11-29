import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, MessageSquare, Calendar, ShoppingBag,
  Settings, Users, BarChart3, Menu as MenuIcon, X, LogOut, Bell,
  Plus, Search, Filter, MoreVertical, Check, Clock,
  ChevronDown, Zap, Building2, CreditCard, Globe,
  Briefcase, UtensilsCrossed, HelpCircle, MapPin, Trash2, Pencil, Copy, Key, Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { format } from 'date-fns'

// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1
    }
  }
})

// Auth Context
interface AuthContextType {
  user: any
  token: string | null
  business: any
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

// API Helper
async function api(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('handled_token')
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  
  return response.json()
}

// ============================================
// AUTH PROVIDER
// ============================================

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('handled_token'))
  const [business, setBusiness] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      api('/api/auth/me')
        .then(data => {
          setUser(data.user)
          if (data.businesses?.length > 0) {
            const savedBusinessId = localStorage.getItem('handled_business_id')
            const biz = data.businesses.find((b: any) => b.id === savedBusinessId) || data.businesses[0]
            setBusiness(biz)
            localStorage.setItem('handled_business_id', biz.id)
          }
        })
        .catch(() => {
          localStorage.removeItem('handled_token')
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = async (email: string, password: string) => {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    localStorage.setItem('handled_token', data.token)
    setToken(data.token)
    setUser(data.user)
    if (data.businesses?.length > 0) {
      setBusiness(data.businesses[0])
      localStorage.setItem('handled_business_id', data.businesses[0].id)
    }
  }

  const logout = () => {
    localStorage.removeItem('handled_token')
    localStorage.removeItem('handled_business_id')
    setToken(null)
    setUser(null)
    setBusiness(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, token, business, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

// ============================================
// LOGIN PAGE
// ============================================

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your Handled dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email"
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password"
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-500" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-stone-600">
            Don't have an account?{' '}
            <Link to="/signup" className="text-orange-600 hover:underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================
// SIGNUP PAGE
// ============================================

function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('RESTAURANT')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Create account
      const authData = await api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      })
      localStorage.setItem('handled_token', authData.token)
      
      // Create business
      await api('/api/businesses', {
        method: 'POST',
        body: JSON.stringify({ name: businessName, industry })
      })
      
      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Start your 14-day free trial</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}
            <div className="space-y-2">
              <Label>Your Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Your Business" required />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RESTAURANT">Restaurant</SelectItem>
                  <SelectItem value="SALON">Salon / Spa</SelectItem>
                  <SelectItem value="AUTO_SERVICE">Auto Service</SelectItem>
                  <SelectItem value="HEALTHCARE">Healthcare</SelectItem>
                  <SelectItem value="FITNESS">Fitness / Gym</SelectItem>
                  <SelectItem value="PROFESSIONAL_SERVICES">Professional Services</SelectItem>
                  <SelectItem value="HOME_SERVICES">Home Services</SelectItem>
                  <SelectItem value="PET_SERVICES">Pet Services</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-500" disabled={loading}>
              {loading ? 'Creating account...' : 'Start free trial'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-stone-600">
            Already have an account?{' '}
            <Link to="/login" className="text-orange-600 hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================
// DASHBOARD LAYOUT
// ============================================

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { user, business, logout } = useAuth()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: MessageSquare, label: 'Conversations', path: '/conversations' },
    { icon: Calendar, label: 'Bookings', path: '/bookings' },
    { icon: ShoppingBag, label: 'Orders', path: '/orders' },
    { icon: BarChart3, label: 'Analytics', path: '/analytics' },
    { icon: Settings, label: 'Settings', path: '/settings' },
    { icon: Shield, label: 'Admin', path: '/admin' },
  ]

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-stone-200 flex flex-col transition-all duration-300`}>
        <div className="p-4 flex items-center gap-3 border-b border-stone-200">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {sidebarOpen && <span className="font-bold text-lg">Handled</span>}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                location.pathname === item.path 
                  ? 'bg-orange-50 text-orange-600' 
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-stone-200">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-stone-100 transition-colors">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-orange-100 text-orange-600">{user?.name?.[0] || 'U'}</AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium truncate">{user?.name}</div>
                    <div className="text-xs text-stone-500 truncate">{business?.name}</div>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={logout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-stone-100 rounded-lg">
            <MenuIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-stone-100 rounded-lg relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-6 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

// ============================================
// DASHBOARD HOME
// ============================================

function DashboardHome() {
  const { business } = useAuth()
  
  const { data: stats } = useQuery({
    queryKey: ['stats', business?.id],
    queryFn: () => api(`/api/businesses/${business?.id}/stats?period=7d`),
    enabled: !!business?.id
  })

  const chartData = [
    { name: 'Mon', conversations: 12, bookings: 4 },
    { name: 'Tue', conversations: 19, bookings: 7 },
    { name: 'Wed', conversations: 15, bookings: 5 },
    { name: 'Thu', conversations: 22, bookings: 9 },
    { name: 'Fri', conversations: 28, bookings: 11 },
    { name: 'Sat', conversations: 35, bookings: 15 },
    { name: 'Sun', conversations: 18, bookings: 6 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Dashboard</h1>
        <p className="text-stone-600">Welcome back! Here's what's happening with {business?.name}.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Conversations</p>
                <p className="text-3xl font-bold">{stats?.metrics?.conversations?.total || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">+{stats?.metrics?.conversations?.change || 0}% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Bookings</p>
                <p className="text-3xl font-bold">{stats?.metrics?.bookings?.total || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">+{stats?.metrics?.bookings?.change || 0}% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Orders</p>
                <p className="text-3xl font-bold">{stats?.metrics?.orders?.total || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">+{stats?.metrics?.orders?.change || 0}% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Automation Rate</p>
                <p className="text-3xl font-bold">{stats?.metrics?.automationRate || 100}%</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-sm text-stone-500 mt-2">Handled by AI</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Overview</CardTitle>
          <CardDescription>Conversations and bookings over the last 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="name" stroke="#737373" />
                <YAxis stroke="#737373" />
                <Tooltip />
                <Area type="monotone" dataKey="conversations" stroke="#f97316" fill="#fed7aa" name="Conversations" />
                <Area type="monotone" dataKey="bookings" stroke="#22c55e" fill="#bbf7d0" name="Bookings" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================
// CONVERSATIONS PAGE
// ============================================

function ConversationsPage() {
  const { business } = useAuth()
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations', business?.id],
    queryFn: () => api(`/api/conversations/${business?.id}`),
    enabled: !!business?.id,
    refetchInterval: 10000
  })

  const conversations = conversationsData?.conversations || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Conversations</h1>
          <p className="text-stone-600">Manage customer chat conversations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Input placeholder="Search..." className="flex-1" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-stone-500">No conversations yet</div>
              ) : (
                conversations.map((conv: any) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`w-full p-4 border-b border-stone-100 hover:bg-stone-50 text-left transition-colors ${
                      selectedConversation?.id === conv.id ? 'bg-orange-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{conv.customerName?.[0] || 'V'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{conv.customerName || 'Visitor'}</span>
                          <span className="text-xs text-stone-500">{format(new Date(conv.lastMessageAt), 'h:mm a')}</span>
                        </div>
                        <p className="text-sm text-stone-500 truncate">{conv.messages?.[0]?.content || 'No messages'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={conv.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                        {conv.status}
                      </Badge>
                      {conv.handedOffToHuman && (
                        <Badge variant="destructive" className="text-xs">Needs attention</Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Conversation Detail */}
        <Card className="lg:col-span-2">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{selectedConversation.customerName?.[0] || 'V'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">{selectedConversation.customerName || 'Visitor'}</CardTitle>
                      <CardDescription>{selectedConversation.customerEmail || selectedConversation.customerPhone || 'No contact info'}</CardDescription>
                    </div>
                  </div>
                  <Badge>{selectedConversation.channel}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] p-4">
                  <div className="space-y-4">
                    {selectedConversation.messages?.map((msg: any) => (
                      <div key={msg.id} className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-lg p-3 ${
                          msg.role === 'USER' ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-900'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <Input placeholder="Type a message..." className="flex-1" />
                    <Button>Send</Button>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-stone-500">
              Select a conversation to view
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ============================================
// BOOKINGS PAGE
// ============================================

function BookingsPage() {
  const { business } = useAuth()
  
  const { data: bookingsData } = useQuery({
    queryKey: ['bookings', business?.id],
    queryFn: () => api(`/api/bookings/${business?.id}`),
    enabled: !!business?.id
  })

  const bookings = bookingsData?.bookings || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Bookings</h1>
          <p className="text-stone-600">Manage reservations and appointments</p>
        </div>
        <Button><Plus className="w-4 h-4 mr-2" /> New Booking</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium text-stone-600">Customer</th>
                  <th className="text-left p-4 font-medium text-stone-600">Date & Time</th>
                  <th className="text-left p-4 font-medium text-stone-600">Party Size</th>
                  <th className="text-left p-4 font-medium text-stone-600">Status</th>
                  <th className="text-left p-4 font-medium text-stone-600">Confirmation</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-stone-500">No bookings yet</td>
                  </tr>
                ) : (
                  bookings.map((booking: any) => (
                    <tr key={booking.id} className="border-b hover:bg-stone-50">
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{booking.customerName}</div>
                          <div className="text-sm text-stone-500">{booking.customerPhone || booking.customerEmail}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>{format(new Date(booking.startTime), 'MMM d, yyyy')}</div>
                        <div className="text-sm text-stone-500">{format(new Date(booking.startTime), 'h:mm a')}</div>
                      </td>
                      <td className="p-4">{booking.partySize} guests</td>
                      <td className="p-4">
                        <Badge variant={booking.status === 'CONFIRMED' ? 'default' : booking.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                          {booking.status}
                        </Badge>
                      </td>
                      <td className="p-4 font-mono text-sm">{booking.confirmationCode}</td>
                      <td className="p-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">Cancel</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================
// ORDERS PAGE
// ============================================

function OrdersPage() {
  const { business } = useAuth()
  
  const { data: ordersData } = useQuery({
    queryKey: ['orders', business?.id],
    queryFn: () => api(`/api/orders/${business?.id}`),
    enabled: !!business?.id
  })

  const orders = ordersData?.orders || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Orders</h1>
          <p className="text-stone-600">Manage takeout and delivery orders</p>
        </div>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <div className="grid gap-4">
            {orders.filter((o: any) => ['PENDING', 'CONFIRMED', 'PREPARING'].includes(o.status)).length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-stone-500">No active orders</CardContent>
              </Card>
            ) : (
              orders.filter((o: any) => ['PENDING', 'CONFIRMED', 'PREPARING'].includes(o.status)).map((order: any) => (
                <Card key={order.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">#{order.orderNumber}</span>
                          <Badge>{order.type}</Badge>
                          <Badge variant={order.status === 'PREPARING' ? 'default' : 'secondary'}>{order.status}</Badge>
                        </div>
                        <div className="text-sm text-stone-500 mt-1">{order.customerName} • {order.customerPhone}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">${order.total.toFixed(2)}</div>
                        <div className="text-sm text-stone-500">{format(new Date(order.createdAt), 'h:mm a')}</div>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      {order.items?.map((item: any) => (
                        <div key={item.id} className="flex justify-between">
                          <span>{item.quantity}x {item.name}</span>
                          <span>${item.totalPrice.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    {order.notes && (
                      <div className="mt-3 p-2 bg-yellow-50 rounded text-sm text-yellow-800">
                        Note: {order.notes}
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm">Mark Ready</Button>
                      <Button size="sm">Complete</Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <Card>
            <CardContent className="p-8 text-center text-stone-500">No completed orders to show</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-stone-50 border-b">
                  <tr>
                    <th className="text-left p-4">Order #</th>
                    <th className="text-left p-4">Customer</th>
                    <th className="text-left p-4">Type</th>
                    <th className="text-left p-4">Total</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: any) => (
                    <tr key={order.id} className="border-b">
                      <td className="p-4 font-mono">{order.orderNumber}</td>
                      <td className="p-4">{order.customerName}</td>
                      <td className="p-4"><Badge variant="secondary">{order.type}</Badge></td>
                      <td className="p-4">${order.total.toFixed(2)}</td>
                      <td className="p-4"><Badge>{order.status}</Badge></td>
                      <td className="p-4 text-sm text-stone-500">{format(new Date(order.createdAt), 'MMM d, h:mm a')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================
// ANALYTICS PAGE
// ============================================

function AnalyticsPage() {
  const { business } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Analytics</h1>
        <p className="text-stone-600">Track performance and insights</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Conversations Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { day: 'Mon', count: 12 },
                  { day: 'Tue', count: 19 },
                  { day: 'Wed', count: 15 },
                  { day: 'Thu', count: 22 },
                  { day: 'Fri', count: 28 },
                  { day: 'Sat', count: 35 },
                  { day: 'Sun', count: 18 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Automation Rate</span>
                <span className="text-2xl font-bold text-green-600">94%</span>
              </div>
              <div className="w-full bg-stone-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '94%' }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Conversations Handled by AI</span>
                <span className="font-medium">847</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Human Handoffs</span>
                <span className="font-medium">53</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Avg Response Time</span>
                <span className="font-medium">1.2s</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================
// SETTINGS PAGE
// ============================================

function SettingsPage() {
  const { business } = useAuth()
  const queryClient = useQueryClient()

  // Services data
  const { data: servicesData } = useQuery({
    queryKey: ['services', business?.id],
    queryFn: () => api(`/api/businesses/${business?.id}/services`),
    enabled: !!business?.id
  })

  // Menu data
  const { data: menuData } = useQuery({
    queryKey: ['menu', business?.id],
    queryFn: () => api(`/api/businesses/${business?.id}/menu`),
    enabled: !!business?.id
  })

  // FAQs data
  const { data: faqsData } = useQuery({
    queryKey: ['faqs', business?.id],
    queryFn: () => api(`/api/businesses/${business?.id}/faqs`),
    enabled: !!business?.id
  })

  // Team data
  const { data: teamData } = useQuery({
    queryKey: ['team', business?.id],
    queryFn: () => api(`/api/businesses/${business?.id}/team`),
    enabled: !!business?.id
  })

  // Locations data
  const { data: locationsData } = useQuery({
    queryKey: ['locations', business?.id],
    queryFn: () => api(`/api/businesses/${business?.id}/locations`),
    enabled: !!business?.id
  })

  // API Keys data
  const { data: apiKeysData } = useQuery({
    queryKey: ['apiKeys', business?.id],
    queryFn: () => api(`/api/businesses/${business?.id}/api-keys`),
    enabled: !!business?.id
  })

  const services = servicesData?.services || []
  const menuCategories = menuData?.categories || []
  const menuItems = menuData?.items || []
  const faqs = faqsData?.faqs || []
  const team = teamData?.members || []
  const locations = locationsData?.locations || []
  const apiKeys = apiKeysData?.apiKeys || []

  // Service mutations
  const createServiceMutation = useMutation({
    mutationFn: (data: any) => api(`/api/businesses/${business?.id}/services`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', business?.id] })
  })

  const deleteServiceMutation = useMutation({
    mutationFn: (id: string) => api(`/api/businesses/${business?.id}/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', business?.id] })
  })

  // FAQ mutations
  const createFaqMutation = useMutation({
    mutationFn: (data: any) => api(`/api/businesses/${business?.id}/faqs`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['faqs', business?.id] })
  })

  const deleteFaqMutation = useMutation({
    mutationFn: (id: string) => api(`/api/businesses/${business?.id}/faqs/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['faqs', business?.id] })
  })

  // Menu mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data: any) => api(`/api/businesses/${business?.id}/menu/categories`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu', business?.id] })
  })

  const createMenuItemMutation = useMutation({
    mutationFn: (data: any) => api(`/api/businesses/${business?.id}/menu/items`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu', business?.id] })
  })

  const deleteMenuItemMutation = useMutation({
    mutationFn: (id: string) => api(`/api/businesses/${business?.id}/menu/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu', business?.id] })
  })

  // Location mutations
  const createLocationMutation = useMutation({
    mutationFn: (data: any) => api(`/api/businesses/${business?.id}/locations`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['locations', business?.id] })
  })

  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) => api(`/api/businesses/${business?.id}/locations/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['locations', business?.id] })
  })

  // Team mutations
  const inviteTeamMemberMutation = useMutation({
    mutationFn: (data: any) => api(`/api/businesses/${business?.id}/team/invite`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', business?.id] })
  })

  const removeTeamMemberMutation = useMutation({
    mutationFn: (id: string) => api(`/api/businesses/${business?.id}/team/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', business?.id] })
  })

  // API Key mutations
  const createApiKeyMutation = useMutation({
    mutationFn: (data: any) => api(`/api/businesses/${business?.id}/api-keys`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys', business?.id] })
  })

  const deleteApiKeyMutation = useMutation({
    mutationFn: (id: string) => api(`/api/businesses/${business?.id}/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys', business?.id] })
  })

  // Form states
  const [newService, setNewService] = useState({ name: '', description: '', duration: 30, price: 0 })
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' })
  const [newCategory, setNewCategory] = useState({ name: '', description: '' })
  const [newMenuItem, setNewMenuItem] = useState({ name: '', description: '', price: 0, categoryId: '' })
  const [newLocation, setNewLocation] = useState({ name: '', address: '', city: '', state: '', zipCode: '', phone: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('STAFF')
  const [newApiKeyName, setNewApiKeyName] = useState('')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
        <p className="text-stone-600">Manage your business and AI settings</p>
      </div>

      <Tabs defaultValue="business">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="business"><Building2 className="w-4 h-4 mr-2" />Business</TabsTrigger>
          <TabsTrigger value="services"><Briefcase className="w-4 h-4 mr-2" />Services</TabsTrigger>
          <TabsTrigger value="menu"><UtensilsCrossed className="w-4 h-4 mr-2" />Menu</TabsTrigger>
          <TabsTrigger value="faqs"><HelpCircle className="w-4 h-4 mr-2" />FAQs</TabsTrigger>
          <TabsTrigger value="team"><Users className="w-4 h-4 mr-2" />Team</TabsTrigger>
          <TabsTrigger value="locations"><MapPin className="w-4 h-4 mr-2" />Locations</TabsTrigger>
          <TabsTrigger value="widget"><Globe className="w-4 h-4 mr-2" />Widget</TabsTrigger>
          <TabsTrigger value="ai"><Zap className="w-4 h-4 mr-2" />AI</TabsTrigger>
          <TabsTrigger value="billing"><CreditCard className="w-4 h-4 mr-2" />Billing</TabsTrigger>
        </TabsList>

        {/* Business Tab */}
        <TabsContent value="business" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>Update your business details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input defaultValue={business?.name} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input defaultValue={business?.phone} placeholder="+1 (555) 123-4567" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue={business?.email} type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input defaultValue={business?.website} placeholder="https://" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea defaultValue={business?.description} placeholder="Tell customers about your business..." />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add New Service</CardTitle>
              <CardDescription>Create services that customers can book</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Service Name</Label>
                  <Input
                    value={newService.name}
                    onChange={e => setNewService({...newService, name: e.target.value})}
                    placeholder="e.g. Haircut, Massage, Consultation"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={newService.duration}
                    onChange={e => setNewService({...newService, duration: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Price ($)</Label>
                  <Input
                    type="number"
                    value={newService.price}
                    onChange={e => setNewService({...newService, price: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={newService.description}
                    onChange={e => setNewService({...newService, description: e.target.value})}
                    placeholder="Brief description"
                  />
                </div>
              </div>
              <Button
                onClick={() => {
                  createServiceMutation.mutate(newService)
                  setNewService({ name: '', description: '', duration: 30, price: 0 })
                }}
                disabled={!newService.name || createServiceMutation.isPending}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Service
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Services ({services.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {services.length === 0 ? (
                <p className="text-stone-500 text-center py-8">No services added yet</p>
              ) : (
                <div className="space-y-3">
                  {services.map((service: any) => (
                    <div key={service.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">{service.name}</div>
                        <div className="text-sm text-stone-500">
                          {service.duration} min • ${service.price?.toFixed(2) || '0.00'}
                        </div>
                        {service.description && <div className="text-sm text-stone-400 mt-1">{service.description}</div>}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm"><Pencil className="w-4 h-4" /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteServiceMutation.mutate(service.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Menu Tab */}
        <TabsContent value="menu" className="mt-6 space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Menu Categories</CardTitle>
                <CardDescription>Organize your menu items</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 mb-4">
                  <Input
                    placeholder="Category name (e.g. Appetizers)"
                    value={newCategory.name}
                    onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                  />
                  <Button
                    className="w-full"
                    onClick={() => {
                      createCategoryMutation.mutate(newCategory)
                      setNewCategory({ name: '', description: '' })
                    }}
                    disabled={!newCategory.name || createCategoryMutation.isPending}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Category
                  </Button>
                </div>
                <Separator className="my-4" />
                {menuCategories.length === 0 ? (
                  <p className="text-stone-500 text-center py-4">No categories yet</p>
                ) : (
                  <div className="space-y-2">
                    {menuCategories.map((cat: any) => (
                      <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <span>{cat.name}</span>
                        <Badge variant="secondary">{cat._count?.items || 0} items</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Menu Item</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Input
                    placeholder="Item name"
                    value={newMenuItem.name}
                    onChange={e => setNewMenuItem({...newMenuItem, name: e.target.value})}
                  />
                  <Input
                    placeholder="Description"
                    value={newMenuItem.description}
                    onChange={e => setNewMenuItem({...newMenuItem, description: e.target.value})}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      placeholder="Price"
                      value={newMenuItem.price || ''}
                      onChange={e => setNewMenuItem({...newMenuItem, price: parseFloat(e.target.value) || 0})}
                    />
                    <Select
                      value={newMenuItem.categoryId}
                      onValueChange={v => setNewMenuItem({...newMenuItem, categoryId: v})}
                    >
                      <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        {menuCategories.map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      createMenuItemMutation.mutate(newMenuItem)
                      setNewMenuItem({ name: '', description: '', price: 0, categoryId: '' })
                    }}
                    disabled={!newMenuItem.name || !newMenuItem.categoryId || createMenuItemMutation.isPending}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Item
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Menu Items ({menuItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {menuItems.length === 0 ? (
                <p className="text-stone-500 text-center py-8">No menu items yet</p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuItems.map((item: any) => (
                    <div key={item.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-lg font-bold text-orange-600">${item.price?.toFixed(2)}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteMenuItemMutation.mutate(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      {item.description && <p className="text-sm text-stone-500 mt-2">{item.description}</p>}
                      <Badge variant="secondary" className="mt-2">{item.category?.name}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add FAQ</CardTitle>
              <CardDescription>Common questions the AI can answer</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Question</Label>
                  <Input
                    value={newFaq.question}
                    onChange={e => setNewFaq({...newFaq, question: e.target.value})}
                    placeholder="e.g. What are your hours?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Answer</Label>
                  <Textarea
                    value={newFaq.answer}
                    onChange={e => setNewFaq({...newFaq, answer: e.target.value})}
                    placeholder="The answer to display..."
                    rows={3}
                  />
                </div>
                <Button
                  onClick={() => {
                    createFaqMutation.mutate(newFaq)
                    setNewFaq({ question: '', answer: '' })
                  }}
                  disabled={!newFaq.question || !newFaq.answer || createFaqMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add FAQ
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>FAQs ({faqs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {faqs.length === 0 ? (
                <p className="text-stone-500 text-center py-8">No FAQs added yet</p>
              ) : (
                <div className="space-y-4">
                  {faqs.map((faq: any) => (
                    <div key={faq.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-stone-900">{faq.question}</div>
                          <div className="text-stone-600 mt-2">{faq.answer}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 ml-2"
                          onClick={() => deleteFaqMutation.mutate(faq.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invite Team Member</CardTitle>
              <CardDescription>Add staff to help manage your business</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="STAFF">Staff</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    inviteTeamMemberMutation.mutate({ email: inviteEmail, role: inviteRole })
                    setInviteEmail('')
                  }}
                  disabled={!inviteEmail || inviteTeamMemberMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-2" /> Invite
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team Members ({team.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {team.length === 0 ? (
                <p className="text-stone-500 text-center py-8">No team members yet</p>
              ) : (
                <div className="space-y-3">
                  {team.map((member: any) => (
                    <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{member.user?.name?.[0] || member.user?.email?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.user?.name || 'Pending'}</div>
                          <div className="text-sm text-stone-500">{member.user?.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={member.role === 'OWNER' ? 'default' : 'secondary'}>{member.role}</Badge>
                        {member.role !== 'OWNER' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() => removeTeamMemberMutation.mutate(member.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Locations Tab */}
        <TabsContent value="locations" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add Location</CardTitle>
              <CardDescription>Add multiple business locations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Location Name</Label>
                  <Input
                    value={newLocation.name}
                    onChange={e => setNewLocation({...newLocation, name: e.target.value})}
                    placeholder="e.g. Downtown, Main Street"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={newLocation.phone}
                    onChange={e => setNewLocation({...newLocation, phone: e.target.value})}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <Label>Address</Label>
                <Input
                  value={newLocation.address}
                  onChange={e => setNewLocation({...newLocation, address: e.target.value})}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={newLocation.city}
                    onChange={e => setNewLocation({...newLocation, city: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={newLocation.state}
                    onChange={e => setNewLocation({...newLocation, state: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Zip Code</Label>
                  <Input
                    value={newLocation.zipCode}
                    onChange={e => setNewLocation({...newLocation, zipCode: e.target.value})}
                  />
                </div>
              </div>
              <Button
                onClick={() => {
                  createLocationMutation.mutate(newLocation)
                  setNewLocation({ name: '', address: '', city: '', state: '', zipCode: '', phone: '' })
                }}
                disabled={!newLocation.name || createLocationMutation.isPending}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Location
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Locations ({locations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {locations.length === 0 ? (
                <p className="text-stone-500 text-center py-8">No locations added yet</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {locations.map((loc: any) => (
                    <div key={loc.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-orange-500" />
                            {loc.name}
                          </div>
                          <div className="text-sm text-stone-500 mt-1">
                            {loc.address && `${loc.address}, `}{loc.city}, {loc.state} {loc.zipCode}
                          </div>
                          {loc.phone && <div className="text-sm text-stone-500">{loc.phone}</div>}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteLocationMutation.mutate(loc.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Widget Tab */}
        <TabsContent value="widget" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Chat Widget</CardTitle>
              <CardDescription>Customize your chat widget appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Greeting Message</Label>
                <Textarea defaultValue={business?.widgetGreeting || "Hi! How can I help you today?"} />
              </div>
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <div className="flex gap-2">
                  <Input defaultValue={business?.primaryColor || "#f97316"} className="w-32" />
                  <div className="w-10 h-10 rounded-lg" style={{ background: business?.primaryColor || "#f97316" }} />
                </div>
              </div>
              <Button>Save Widget Settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Manage API keys for widget integration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-4">
                <Input
                  placeholder="API key name (e.g. Production, Development)"
                  value={newApiKeyName}
                  onChange={e => setNewApiKeyName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    createApiKeyMutation.mutate({ name: newApiKeyName })
                    setNewApiKeyName('')
                  }}
                  disabled={!newApiKeyName || createApiKeyMutation.isPending}
                >
                  <Key className="w-4 h-4 mr-2" /> Generate Key
                </Button>
              </div>

              {apiKeys.length === 0 ? (
                <p className="text-stone-500 text-center py-4">No API keys yet</p>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((key: any) => (
                    <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{key.name}</div>
                        <div className="font-mono text-sm text-stone-500">
                          {key.key?.slice(0, 12)}...{key.key?.slice(-4)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigator.clipboard.writeText(key.key)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteApiKeyMutation.mutate(key.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-6" />

              <div>
                <Label className="mb-2 block">Embed Code</Label>
                <div className="bg-stone-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  {`<script src="${window.location.origin.replace('5174', '3001')}/widget/embed.js" data-api-key="${apiKeys[0]?.key || 'YOUR_API_KEY'}"></script>`}
                </div>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => navigator.clipboard.writeText(`<script src="${window.location.origin.replace('5174', '3001')}/widget/embed.js" data-api-key="${apiKeys[0]?.key || 'YOUR_API_KEY'}"></script>`)}
                >
                  <Copy className="w-4 h-4 mr-2" /> Copy Code
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
              <CardDescription>Customize how the AI handles conversations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>AI Personality</Label>
                <Select defaultValue="friendly">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly & Casual</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="concise">Concise & Efficient</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Custom Instructions</Label>
                <Textarea
                  placeholder="Add any special instructions for the AI..."
                  defaultValue={business?.aiInstructions}
                  rows={4}
                />
                <p className="text-sm text-stone-500">Example: "Always recommend the daily special" or "We don't take reservations for parties over 10"</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-handoff for complex queries</Label>
                  <p className="text-sm text-stone-500">Automatically transfer to human when AI is uncertain</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Button>Save AI Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>Manage your plan and billing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg mb-4">
                <div>
                  <div className="font-bold text-lg capitalize">{business?.plan || 'Trial'} Plan</div>
                  <div className="text-stone-600">
                    {business?.plan === 'TRIAL' ? '14-day free trial' : '$99/month'}
                  </div>
                </div>
                <Badge className="bg-green-500">Active</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Conversations used</span>
                  <span>0 / {business?.plan === 'TRIAL' ? '50' : '2,500'}</span>
                </div>
                <div className="w-full bg-stone-200 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full" style={{ width: '0%' }} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline">Upgrade Plan</Button>
                <Button variant="outline">Billing History</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================
// ADMIN PAGE (Super Admin Only)
// ============================================

function AdminPage() {
  const { user } = useAuth()

  // Admin stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api('/api/admin/stats')
  })

  // Users list
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api('/api/admin/users?limit=20')
  })

  // Businesses list
  const { data: businessesData, isLoading: businessesLoading } = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: () => api('/api/admin/businesses?limit=20')
  })

  const stats = statsData?.stats
  const users = usersData?.users || []
  const businesses = businessesData?.businesses || []

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Super Admin Dashboard</h1>
        <p className="text-stone-600">Manage your SaaS platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-stone-500">Total Users</div>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <div className="text-xs text-green-600">+{stats?.recentUsers || 0} this week</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-stone-500">Total Businesses</div>
            <div className="text-2xl font-bold">{stats?.totalBusinesses || 0}</div>
            <div className="text-xs text-green-600">+{stats?.recentBusinesses || 0} this week</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-stone-500">Total Conversations</div>
            <div className="text-2xl font-bold">{stats?.totalConversations || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-stone-500">Total Bookings</div>
            <div className="text-2xl font-bold">{stats?.totalBookings || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Businesses by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {stats?.businessesByPlan?.map((item: any) => (
              <div key={item.plan} className="flex items-center gap-2">
                <Badge variant={item.plan === 'TRIAL' ? 'secondary' : 'default'}>
                  {item.plan}
                </Badge>
                <span className="font-bold">{item._count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users.slice(0, 10).map((user: any) => (
                <div key={user.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{user.name || 'No name'}</div>
                    <div className="text-sm text-stone-500">{user.email}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">{user._count?.businesses || 0} businesses</Badge>
                    <div className="text-xs text-stone-400">{new Date(user.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Businesses */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Businesses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {businesses.slice(0, 10).map((biz: any) => (
                <div key={biz.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{biz.name}</div>
                    <div className="text-sm text-stone-500">{biz.industry}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant={biz.plan === 'TRIAL' ? 'secondary' : 'default'}>{biz.plan}</Badge>
                    <div className="text-xs text-stone-400">
                      {biz._count?.conversations || 0} convos • {biz._count?.bookings || 0} bookings
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================
// PROTECTED ROUTE
// ============================================

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <DashboardLayout>{children}</DashboardLayout>
}

// ============================================
// MAIN APP
// ============================================

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to="/" /> : <SignupPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
      <Route path="/conversations" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
      <Route path="/bookings" element={<ProtectedRoute><BookingsPage /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
