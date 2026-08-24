import { useState, useRef, useEffect } from "react";
import { useSendChatMessage, ChatHistoryItem, ChatHistoryItemRole } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Loader2, Sparkles, Info, AlertCircle } from "lucide-react";

export default function Chat() {
  const { organizationId, t } = useAppContext();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<(ChatHistoryItem & { isOutOfScope?: boolean })[]>([]);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([
    "What are the most critical needs right now?",
    "Which zones need more volunteers?",
    "Summarize recent medical requests.",
    "Show me the status of water distribution."
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = useSendChatMessage();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, sendMessage.isPending]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatHistoryItem = { role: ChatHistoryItemRole.user, content: text };
    setHistory(prev => [...prev, userMsg]);
    setInput("");

    try {
      const response = await sendMessage.mutateAsync({
        data: {
          message: text,
          organizationId,
          history
        }
      });

      setHistory(prev => [...prev, { 
        role: ChatHistoryItemRole.assistant, 
        content: response.message,
        isOutOfScope: (response as any).isOutOfScope 
      }]);
      if (response.quickPrompts && response.quickPrompts.length > 0) {
        setQuickPrompts(response.quickPrompts);
      }
    } catch (error) {
      setHistory(prev => [...prev, { role: ChatHistoryItemRole.assistant, content: "Sorry, I encountered an error processing your request. Please try again." }]);
    }
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("nav.chat")}</h1>
        <p className="text-muted-foreground mt-1">Operational Assistant</p>
        <p className="text-xs text-muted-foreground mt-0.5 font-medium">Answers questions about your dashboard data only — needs, volunteers, assignments, and reports.</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-primary/20 shadow-md">
        <CardHeader className="bg-primary/5 border-b py-3 px-4 shrink-0">
          <CardTitle className="flex items-center gap-2 text-primary text-base">
            <Bot className="w-5 h-5" />
            CommUnity Hub Assistant
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-hidden p-0 bg-muted/10">
          <ScrollArea className="h-full p-4" ref={scrollRef}>
            <div className="space-y-4 pb-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-card border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground max-w-[85%]">
                  Hello! I'm your CommUnity Hub AI Assistant. How can I help you manage operations today?
                </div>
              </div>

              {history.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                  }`}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`shadow-sm px-4 py-3 text-sm max-w-[85%] ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm' 
                      : msg.isOutOfScope
                        ? 'bg-amber-50 border-amber-200 text-amber-900 rounded-2xl rounded-tl-sm flex items-start gap-2 shadow-inner border-l-4 border-l-amber-400'
                        : 'bg-card border text-foreground rounded-2xl rounded-tl-sm'
                  }`}>
                    {msg.isOutOfScope && <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}

              {sendMessage.isPending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-card border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>

        <div className="bg-card border-t p-3 shrink-0">
          {quickPrompts.length > 0 && (
            <div className="mb-3 px-1">
              <div className="flex items-center gap-1 mb-2">
                 <Sparkles className="w-3 h-3 text-primary" />
                 <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Quick Actions</span>
              </div>
              <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth">
                {quickPrompts.map((prompt, i) => (
                  <Badge 
                    key={i} 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors font-medium py-1.5 px-3 whitespace-nowrap border-primary/10 bg-primary/5"
                    onClick={() => handleSend(prompt)}
                  >
                    {prompt}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }} 
            className="flex gap-2"
          >
            <Input 
              placeholder="Type your message..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sendMessage.isPending}
              className="flex-1"
            />
            <Button type="submit" disabled={!input.trim() || sendMessage.isPending} className="shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
