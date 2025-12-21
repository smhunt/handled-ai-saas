import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SignIn,
  SignUp,
  UserButton,
  SignedIn,
  SignedOut,
  useUser,
  useAuth as useClerkAuth,
  RedirectToSignIn
} from '@clerk/clerk-react'
import {
  LayoutDashboard, MessageSquare, Calendar, ShoppingBag,
  Settings, Users, BarChart3, Menu as MenuIcon, X, LogOut, Bell,
  Plus, Search, Filter, MoreVertical, Check, Clock,
  ChevronDown, Zap, Building2, CreditCard, Globe,
  Briefcase, UtensilsCrossed, HelpCircle, MapPin, Trash2, Pencil, Copy, Key, Shield, Download, Sun, Moon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { format, formatDistanceToNow } from 'date-fns'
import { io, Socket } from 'socket.io-client'

// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// CSV Export Utility
function exportToCSV(data: any[], filename: string, columns: { key: string; header: string }[]) {
  const headers = columns.map(c => c.header).join(',')
  const rows = data.map(item =>
    columns.map(c => {
      const value = c.key.split('.').reduce((obj, key) => obj?.[key], item)
      const str = String(value ?? '')
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
    }).join(',')
  )
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
}

// Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1
    }
  }
})

// Theme Context
type Theme = 'light' | 'dark'
interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}
const ThemeContext = createContext<ThemeContextType | null>(null)

function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('handled_theme') as Theme
    return saved || 'light'
  })

  useEffect(() => {
    localStorage.setItem('handled_theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  )
}

// ============================================
// BUSINESS CONTEXT (separate from Clerk auth)
// ============================================
interface BusinessContextType {
  business: any
  setBusiness: (business: any) => void
  isLoading: boolean
}

const BusinessContext = createContext<BusinessContextType | null>(null)

function useBusiness() {
  const context = useContext(BusinessContext)
  if (!context) throw new Error('useBusiness must be used within BusinessProvider')
  return context
}

// API Helper with Clerk token
function useApi() {
  const { getToken } = useClerkAuth()
  
  return async (endpoint: string, options: RequestInit = {}) => {
    const token = await getToken()
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
}

// Notification Types & Context
interface Notification {
  id: string
  type: 'booking' | 'order' | 'conversation' | 'handoff' | 'info'
  title: string
  message: string
  data?: any
  createdAt: string
  read?: boolean
  priority?: 'low' | 'normal' | 'high'
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearNotifications: () => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}

function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useClerkAuth()
  const { business } = useBusiness()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!business?.id) return

    const connectSocket = async () => {
      const token = await getToken()
      if (!token) return

      const newSocket = io(API_URL, {
        auth: { token }
      })

      newSocket.on('connect', () => console.log('Connected to notification socket'))
      newSocket.on('notification', (notification: Notification) => {
        setNotifications(prev => [{ ...notification, read: false }, ...prev].slice(0, 50))
      })
      newSocket.on('disconnect', () => console.log('Disconnected from notification socket'))

      setSocket(newSocket)
    }

    connectSocket()

    return () => {
      socket?.disconnect()
    }
  }, [business?.id, getToken])

  const unreadCount = notifications.filter(n => !n.read).length
  const markAsRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const clearNotifications = () => setNotifications([])

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications }}>
      {children}
    </NotificationContext.Provider>
  )
}

// Notification Bell Component
function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications()
  const navigate = useNavigate()

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'booking': return <Calendar className="w-4 h-4 text-green-500" />
      case 'order': return <ShoppingBag className="w-4 h-4 text-blue-500" />
      case 'conversation': return <MessageSquare className="w-4 h-4 text-purple-500" />
      case 'handoff': return <Users className="w-4 h-4 text-red-500" />
      default: return <Bell className="w-4 h-4 text-stone-500" />
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)
    switch (notification.type) {
      case 'booking': navigate('/bookings'); break
      case 'order': navigate('/orders'); break
      case 'conversation':
      case 'handoff': navigate('/conversations'); break
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg relative">
          <Bell className="w-5 h-5 dark:text-white" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          {notifications.length > 0 && (
            <div className="flex gap-2">
              <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
              <button onClick={clearNotifications} className="text-xs text-stone-500 hover:underline">Clear</button>
            </div>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-stone-500 text-sm">No notifications yet</div>
          ) : (
            notifications.map(notification => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full p-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800 border-b last:border-b-0 ${!notification.read ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
              >
                <div className="flex gap-3">
                  <div className="shrink-0 mt-0.5">{getNotificationIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${notification.priority === 'high' ? 'text-red-600' : ''}`}>
                        {notification.title}
                      </span>
                      {!notification.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                    </div>
                    <p className="text-xs text-stone-500 truncate">{notification.message}</p>
                    <p className="text-xs text-stone-400 mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ============================================
// BUSINESS PROVIDER
// ============================================
function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuth()
  const { user } = useUser()
  const [business, setBusiness] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const api = useApi()

  useEffect(() => {
    if (!isLoaded) return
    
    if (!isSignedIn) {
      setIsLoading(false)
      setBusiness(null)
      return
    }

    // Fetch or create user and get their businesses
    const initBusiness = async () => {
      try {
        const data = await api('/api/auth/me')
        if (data.businesses?.length > 0) {
          const savedBusinessId = localStorage.getItem('handled_business_id')
          const biz = data.businesses.find((b: any) => b.id === savedBusinessId) || data.businesses[0]
          setBusiness(biz)
          localStorage.setItem('handled_business_id', biz.id)
        }
      } catch (error) {
        console.error('Failed to init business:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initBusiness()
  }, [isSignedIn, isLoaded, user?.id])

  return (
    <BusinessContext.Provider value={{ business, setBusiness, isLoading }}>
      {children}
    </BusinessContext.Provider>
  )
}

// ============================================
// SIGN IN PAGE
// ============================================
function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 p-4">
      <SignIn 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-xl"
          }
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
      />
    </div>
  )
}

// ============================================
// SIGN UP PAGE
// ============================================
function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 p-4">
      <SignUp 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-xl"
          }
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/onboarding"
      />
    </div>
  )
}

// ============================================
// ONBOARDING PAGE (create business after signup)
// ============================================
function OnboardingPage() {
  const { user } = useUser()
  const { business, setBusiness } = useBusiness()
  const navigate = useNavigate()
  const api = useApi()
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('RESTAURANT')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // If user already has a business, redirect to dashboard
  useEffect(() => {
    if (business) {
      navigate('/')
    }
  }, [business, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api('/api/businesses', {
        method: 'POST',
        body: JSON.stringify({ name: businessName, industry })
      })
      setBusiness(data.business)
      localStorage.setItem('handled_business_id', data.business.id)
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
          <CardTitle className="text-2xl">Welcome, {user?.firstName}!</CardTitle>
          <CardDescription>Let's set up your business</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}
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
              {loading ? 'Creating...' : 'Create Business'}
            </Button>
          </form>
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
  const { user } = useUser()
  const { business } = useBusiness()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: MessageSquare, label: 'Conversations', path: '/conversations' },
    { icon: Calendar, label: 'Bookings', path: '/bookings' },
    { icon: ShoppingBag, label: 'Orders', path: '/orders' },
    { icon: BarChart3, label: 'Analytics', path: '/analytics' },
    { icon: Settings, label: 'Settings', path: '/settings' },
    // Admin route would need to check user metadata from Clerk
  ]

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 flex flex-col transition-all duration-300`}>
        <div className="p-4 flex items-center gap-3 border-b border-stone-200 dark:border-stone-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {sidebarOpen && <span className="font-bold text-lg dark:text-white">Handled</span>}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                location.pathname === item.path
                  ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-3 w-full p-2">
            <UserButton 
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8"
                }
              }}
            />
            {sidebarOpen && (
              <div className="flex-1 text-left">
                <div className="text-sm font-medium truncate dark:text-white">{user?.fullName}</div>
                <div className="text-xs text-stone-500 dark:text-stone-400 truncate">{business?.name}</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg">
            <MenuIcon className="w-5 h-5 dark:text-white" />
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-6 overflow-auto dark:bg-stone-950">
          {children}
        </div>
      </main>
    </div>
  )
}
