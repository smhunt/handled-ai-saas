import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  MessageSquare,
  Calendar,
  ShoppingBag,
  Clock,
  Zap,
  ChefHat,
  Scissors,
  Car,
  Stethoscope,
  Dumbbell,
  Briefcase,
  Home,
  Dog,
  Check,
  ArrowRight,
  Play,
  Star,
  Menu,
  X,
  Send,
  Mail,
  Phone,
  MapPin
} from 'lucide-react'

// Newsletter Signup Component
function NewsletterSignup() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')

    try {
      const response = await fetch('http://localhost:3001/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      if (response.ok) {
        setStatus('sent')
        setEmail('')
        setTimeout(() => setStatus('idle'), 5000)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    } catch {
      // For demo, simulate success
      setStatus('sent')
      setEmail('')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <Input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="bg-stone-800 border-stone-700 text-white placeholder:text-stone-500 focus:border-orange-500"
        disabled={status === 'sending'}
      />
      <Button
        type="submit"
        className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 whitespace-nowrap"
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Subscribing...' : status === 'sent' ? (
          <><Check className="w-4 h-4 mr-1" /> Subscribed!</>
        ) : 'Subscribe'}
      </Button>
    </form>
  )
}

// Contact Form Component
function ContactForm() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')

    try {
      // In production, this would send to your backend API
      const response = await fetch('http://localhost:3001/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setStatus('sent')
        setFormData({ name: '', email: '', subject: '', message: '' })
        setTimeout(() => setStatus('idle'), 5000)
      } else {
        setStatus('error')
      }
    } catch {
      // For demo, simulate success
      setStatus('sent')
      setFormData({ name: '', email: '', subject: '', message: '' })
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Your name"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          placeholder="How can we help?"
          value={formData.subject}
          onChange={e => setFormData({ ...formData, subject: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          placeholder="Tell us more about your inquiry..."
          rows={5}
          value={formData.message}
          onChange={e => setFormData({ ...formData, message: e.target.value })}
          required
        />
      </div>
      <Button
        type="submit"
        className="w-full bg-orange-500 hover:bg-orange-600"
        disabled={status === 'sending'}
      >
        {status === 'sending' ? (
          'Sending...'
        ) : status === 'sent' ? (
          <>
            <Check className="w-4 h-4 mr-2" /> Message Sent!
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" /> Send Message
          </>
        )}
      </Button>
      {status === 'error' && (
        <p className="text-red-500 text-sm text-center">Failed to send. Please try again.</p>
      )}
    </form>
  )
}

// Chat Demo Component
function ChatDemo() {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [key, setKey] = useState(0)
  
  const conversation = [
    { role: 'user' as const, text: "Hi, I'd like to make a reservation for Saturday" },
    { role: 'ai' as const, text: "I'd be happy to help! How many guests will be joining you, and what time works best?" },
    { role: 'user' as const, text: "4 people, around 7pm" },
    { role: 'ai' as const, text: "Perfect! I have a table for 4 at 7:00 PM this Saturday, November 30th. Can I get a name for the reservation?" },
    { role: 'user' as const, text: "Sarah Chen" },
    { role: 'ai' as const, text: "All set, Sarah! ✓ Your table for 4 is confirmed for Saturday at 7 PM. We'll text you a reminder. Anything else I can help with?" },
  ]

  useEffect(() => {
    let currentIndex = 0
    let timeoutId: ReturnType<typeof setTimeout>
    
    const showNextMessage = () => {
      if (currentIndex < conversation.length) {
        if (conversation[currentIndex].role === 'ai') {
          setIsTyping(true)
          timeoutId = setTimeout(() => {
            setIsTyping(false)
            setMessages(prev => [...prev, conversation[currentIndex]])
            currentIndex++
            timeoutId = setTimeout(showNextMessage, 1500)
          }, 1200)
        } else {
          setMessages(prev => [...prev, conversation[currentIndex]])
          currentIndex++
          timeoutId = setTimeout(showNextMessage, 1500)
        }
      } else {
        timeoutId = setTimeout(() => {
          setMessages([])
          setKey(k => k + 1)
        }, 4000)
      }
    }

    timeoutId = setTimeout(showNextMessage, 1000)
    return () => clearTimeout(timeoutId)
  }, [key])

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden max-w-sm w-full">
      <div className="bg-gradient-to-r from-stone-900 to-stone-800 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-white font-semibold text-sm">Bella's Kitchen</div>
          <div className="text-stone-400 text-xs flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            Online now
          </div>
        </div>
      </div>
      <div className="h-80 p-4 space-y-3 overflow-y-auto bg-stone-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
              msg.role === 'user' 
                ? 'bg-stone-900 text-white rounded-br-md' 
                : 'bg-white border border-stone-200 text-stone-800 rounded-bl-md shadow-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-200 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-stone-200 bg-white">
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Type a message..." 
            className="flex-1 px-4 py-2 rounded-full bg-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
          <button className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-white">
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Pricing Component
function PricingCard({ 
  name, 
  price, 
  description, 
  features, 
  popular = false,
  cta = "Start free trial"
}: { 
  name: string
  price: string
  description: string
  features: string[]
  popular?: boolean
  cta?: string
}) {
  return (
    <Card className={`relative ${popular ? 'border-orange-500 border-2 shadow-xl scale-105' : 'border-stone-200'}`}>
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Most Popular</Badge>
        </div>
      )}
      <CardContent className="p-6">
        <h3 className="text-xl font-bold text-stone-900">{name}</h3>
        <div className="mt-4">
          <span className="text-4xl font-bold text-stone-900">{price}</span>
          {price !== "Custom" && <span className="text-stone-500">/month</span>}
        </div>
        <p className="mt-2 text-stone-600 text-sm">{description}</p>
        <ul className="mt-6 space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <span className="text-stone-700">{feature}</span>
            </li>
          ))}
        </ul>
        <Button
          className={`w-full mt-6 ${popular ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' : ''}`}
          variant={popular ? 'default' : 'outline'}
          asChild
        >
          <a href="http://localhost:5174/register">{cta}</a>
        </Button>
      </CardContent>
    </Card>
  )
}

// Industry Card Component
function IndustryCard({ icon: Icon, name, description }: { icon: any, name: string, description: string }) {
  return (
    <Card className="group hover:shadow-lg hover:border-orange-200 transition-all cursor-pointer">
      <CardContent className="p-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center mb-4 group-hover:from-amber-100 group-hover:to-orange-200 transition-colors">
          <Icon className="w-6 h-6 text-orange-600" />
        </div>
        <h3 className="font-semibold text-stone-900 mb-1">{name}</h3>
        <p className="text-sm text-stone-600">{description}</p>
      </CardContent>
    </Card>
  )
}

// Feature Section
function FeatureSection({ 
  icon: Icon, 
  title, 
  description, 
  features,
  reversed = false 
}: { 
  icon: any
  title: string
  description: string
  features: string[]
  reversed?: boolean 
}) {
  return (
    <div className={`flex flex-col ${reversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 items-center`}>
      <div className="flex-1">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center mb-6">
          <Icon className="w-7 h-7 text-orange-600" />
        </div>
        <h3 className="text-3xl font-bold text-stone-900 mb-4">{title}</h3>
        <p className="text-lg text-stone-600 mb-6">{description}</p>
        <ul className="space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-stone-700">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 w-full">
        <div className="bg-gradient-to-br from-stone-100 to-stone-200 rounded-2xl aspect-video flex items-center justify-center">
          <Icon className="w-20 h-20 text-stone-400" />
        </div>
      </div>
    </div>
  )
}

// Stats Component
function StatCard({ value, label }: { value: string, label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
        {value}
      </div>
      <div className="text-stone-600 mt-2">{label}</div>
    </div>
  )
}

// Testimonial Component
function TestimonialCard({ quote, author, role, company, avatar }: { 
  quote: string
  author: string
  role: string
  company: string
  avatar: string
}) {
  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex gap-1 mb-4">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <p className="text-stone-700 mb-6 leading-relaxed">"{quote}"</p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-200 to-orange-300 flex items-center justify-center font-bold text-orange-700">
            {avatar}
          </div>
          <div>
            <div className="font-semibold text-stone-900">{author}</div>
            <div className="text-sm text-stone-500">{role}, {company}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Main App
export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between h-16">
            <a href="#" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-stone-900">Handled</span>
            </a>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-stone-600 hover:text-stone-900 transition-colors">Features</a>
              <a href="#industries" className="text-stone-600 hover:text-stone-900 transition-colors">Industries</a>
              <a href="#pricing" className="text-stone-600 hover:text-stone-900 transition-colors">Pricing</a>
              <a href="#how-it-works" className="text-stone-600 hover:text-stone-900 transition-colors">How it works</a>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Button variant="ghost" asChild>
                <a href="http://localhost:5174">Sign in</a>
              </Button>
              <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600" asChild>
                <a href="http://localhost:5174">Start free trial</a>
              </Button>
            </div>

            <button 
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </nav>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-stone-200 p-4 space-y-4">
            <a href="#features" className="block text-stone-600">Features</a>
            <a href="#industries" className="block text-stone-600">Industries</a>
            <a href="#pricing" className="block text-stone-600">Pricing</a>
            <a href="#" className="block text-stone-600">Docs</a>
            <div className="pt-4 space-y-2">
              <Button variant="outline" className="w-full" asChild>
                <a href="http://localhost:5174">Sign in</a>
              </Button>
              <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500" asChild>
                <a href="http://localhost:5174/register">Start free trial</a>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 text-center lg:text-left">
              <Badge variant="secondary" className="mb-6 bg-orange-100 text-orange-700 hover:bg-orange-100">
                <Zap className="w-3 h-3 mr-1" />
                AI-Powered Booking Agent
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-stone-900 leading-tight">
                Never miss a booking
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500"> again</span>
              </h1>
              <p className="mt-6 text-xl text-stone-600 max-w-xl mx-auto lg:mx-0">
                An AI assistant that answers customer questions, takes reservations, and processes orders 24/7. Works while you sleep.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 h-14 px-8 text-lg" asChild>
                  <a href="http://localhost:5174/register">
                    Start free trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg" asChild>
                  <a href="#how-it-works">
                    <Play className="w-5 h-5 mr-2" />
                    Watch demo
                  </a>
                </Button>
              </div>
              <p className="mt-4 text-sm text-stone-500">No credit card required · 14-day free trial · Cancel anytime</p>
            </div>
            <div className="flex-1 flex justify-center">
              <ChatDemo />
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-y border-stone-200 bg-white">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-stone-500 mb-8">Trusted by 2,000+ businesses worldwide</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCard value="2M+" label="Messages handled" />
            <StatCard value="50K+" label="Bookings made" />
            <StatCard value="99.9%" label="Uptime" />
            <StatCard value="4.9★" label="Customer rating" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 mb-4">
              Everything you need to automate your front desk
            </h2>
            <p className="text-lg text-stone-600 max-w-2xl mx-auto">
              From answering FAQs to taking complex orders, Handled manages customer conversations so you can focus on your business.
            </p>
          </div>

          <div className="space-y-24">
            <FeatureSection 
              icon={Calendar}
              title="Smart Booking System"
              description="Let customers book appointments 24/7. Handles availability, conflicts, and sends automatic confirmations."
              features={[
                "Real-time availability checking",
                "Automatic confirmation & reminders",
                "Handles rescheduling & cancellations",
                "Integrates with Google Calendar, Outlook, and more"
              ]}
            />
            <FeatureSection 
              icon={ShoppingBag}
              title="Order Taking"
              description="Take food orders, service requests, or product orders through natural conversation."
              features={[
                "Menu/service catalog upload",
                "Handles modifications & special requests",
                "Upselling & recommendations",
                "Order summaries & confirmations"
              ]}
              reversed
            />
            <FeatureSection 
              icon={MessageSquare}
              title="Intelligent Conversations"
              description="Answers FAQs, handles edge cases, and knows when to escalate to a human."
              features={[
                "Learns your business from your website",
                "Supports 50+ languages",
                "Recognizes intent & sentiment",
                "Seamless human handoff when needed"
              ]}
            />
            <FeatureSection 
              icon={Clock}
              title="24/7 Availability"
              description="Never miss after-hours inquiries again. Capture bookings and orders around the clock."
              features={[
                "Works nights, weekends, and holidays",
                "Instant responses, no wait times",
                "SMS, web chat, and social media",
                "Detailed analytics & reporting"
              ]}
              reversed
            />
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="py-24 px-4 sm:px-6 lg:px-8 bg-stone-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Industries</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 mb-4">
              Built for every service business
            </h2>
            <p className="text-lg text-stone-600 max-w-2xl mx-auto">
              Whether you're taking dinner reservations or scheduling oil changes, Handled adapts to your workflow.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <IndustryCard icon={ChefHat} name="Restaurants" description="Reservations, takeout orders, catering inquiries" />
            <IndustryCard icon={Scissors} name="Salons & Spas" description="Appointments, stylist preferences, service selection" />
            <IndustryCard icon={Car} name="Auto Services" description="Service scheduling, quote requests, status updates" />
            <IndustryCard icon={Stethoscope} name="Healthcare" description="Patient scheduling, intake prep, insurance questions" />
            <IndustryCard icon={Dumbbell} name="Fitness & Wellness" description="Class bookings, trainer schedules, membership info" />
            <IndustryCard icon={Briefcase} name="Professional Services" description="Consultation booking for lawyers, accountants, consultants" />
            <IndustryCard icon={Home} name="Home Services" description="HVAC, plumbing, electrical scheduling & quotes" />
            <IndustryCard icon={Dog} name="Pet Services" description="Grooming, boarding, vet appointment scheduling" />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">How it works</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 mb-4">
              Live in 10 minutes, not 10 weeks
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-orange-600">1</span>
              </div>
              <h3 className="font-semibold text-xl text-stone-900 mb-2">Connect your business</h3>
              <p className="text-stone-600">Upload your menu, services, or link your website. We'll learn everything automatically.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-orange-600">2</span>
              </div>
              <h3 className="font-semibold text-xl text-stone-900 mb-2">Set your rules</h3>
              <p className="text-stone-600">Configure hours, capacity, booking rules, and how you want conversations handled.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-orange-600">3</span>
              </div>
              <h3 className="font-semibold text-xl text-stone-900 mb-2">Go live</h3>
              <p className="text-stone-600">Add our widget to your site with one line of code. Start handling customers instantly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-stone-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-white/10 text-white hover:bg-white/20">Testimonials</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Loved by business owners
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <TestimonialCard 
              quote="We were missing 30% of calls during dinner rush. Now every inquiry gets handled instantly. Our reservations are up 40%."
              author="Maria Santos"
              role="Owner"
              company="La Cocina"
              avatar="MS"
            />
            <TestimonialCard 
              quote="Setup took 15 minutes. My stylists can focus on clients instead of answering the phone. Best business decision this year."
              author="James Wilson"
              role="Owner"
              company="Modern Cuts"
              avatar="JW"
            />
            <TestimonialCard 
              quote="Patients love booking online at midnight. We've reduced no-shows by 60% with the automatic reminders."
              author="Dr. Sarah Kim"
              role="Practice Manager"
              company="Smile Dental"
              avatar="SK"
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Pricing</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 mb-4">
              Simple pricing that scales with you
            </h2>
            <p className="text-lg text-stone-600">Start free. Upgrade when you're ready.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <PricingCard 
              name="Starter"
              price="$49"
              description="Perfect for small businesses just getting started."
              features={[
                "500 conversations/month",
                "Web chat widget",
                "Basic booking system",
                "Email notifications",
                "Standard support"
              ]}
            />
            <PricingCard 
              name="Professional"
              price="$99"
              description="For growing businesses that need more power."
              features={[
                "2,500 conversations/month",
                "Web + SMS channels",
                "Full booking + ordering",
                "SMS & email notifications",
                "Calendar integrations",
                "Custom branding",
                "Priority support"
              ]}
              popular
            />
            <PricingCard 
              name="Business"
              price="$199"
              description="For established businesses with high volume."
              features={[
                "10,000 conversations/month",
                "All channels",
                "Multi-location support",
                "Advanced analytics",
                "API access",
                "Webhook integrations",
                "Dedicated support"
              ]}
            />
          </div>

          <div className="mt-12 text-center">
            <p className="text-stone-600 mb-4">Need more? We offer custom enterprise plans.</p>
            <Button variant="outline" asChild>
              <a href="mailto:sales@handled.ai">Contact sales</a>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-500 to-orange-500">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to never miss a customer again?
          </h2>
          <p className="text-xl text-white/90 mb-10">
            Join thousands of businesses using Handled to automate their bookings and orders.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-orange-600 hover:bg-stone-100 h-14 px-8 text-lg" asChild>
              <a href="http://localhost:5174/register">
                Start your free trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 h-14 px-8 text-lg" asChild>
              <a href="mailto:sales@handled.ai">Talk to sales</a>
            </Button>
          </div>
          <p className="mt-6 text-white/80 text-sm">14-day free trial · No credit card required</p>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-orange-100 text-orange-600 hover:bg-orange-100">Get in Touch</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 mb-4">
              Have questions? We'd love to hear from you
            </h2>
            <p className="text-xl text-stone-600 max-w-2xl mx-auto">
              Send us a message and we'll respond as soon as possible.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Contact Form */}
            <Card className="p-6">
              <CardContent className="p-0">
                <ContactForm />
              </CardContent>
            </Card>

            {/* Contact Info */}
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold text-stone-900 mb-6">Contact Information</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <div className="font-medium text-stone-900">Email</div>
                      <a href="mailto:hello@handled.ai" className="text-stone-600 hover:text-orange-600">hello@handled.ai</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <div className="font-medium text-stone-900">Phone</div>
                      <a href="tel:+1-555-HANDLED" className="text-stone-600 hover:text-orange-600">+1-555-HANDLED</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <div className="font-medium text-stone-900">Office</div>
                      <div className="text-stone-600">San Francisco, CA</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-stone-900 mb-4">Business Hours</h3>
                <div className="space-y-2 text-stone-600">
                  <div className="flex justify-between">
                    <span>Monday - Friday</span>
                    <span>9:00 AM - 6:00 PM PST</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saturday - Sunday</span>
                    <span>Closed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 bg-stone-900 text-stone-400">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
            <div className="lg:col-span-2">
              <a href="#" className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Handled</span>
              </a>
              <p className="text-sm max-w-xs mb-4">
                AI-powered booking and order management for service businesses. Never miss a customer again.
              </p>
              <div className="mt-6">
                <h4 className="font-semibold text-white mb-3">Stay updated</h4>
                <p className="text-sm mb-3">Get the latest news and product updates.</p>
                <NewsletterSignup />
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-stone-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm">© 2024 Handled by EcoWorks. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">Twitter</a>
              <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
