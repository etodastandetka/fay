import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Order } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, FileText, Eye, Image, Download, FileDown, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon } from "lucide-react";

const ORDER_STATUSES = [
  { value: "pending", label: "В ожидании", color: "bg-amber-100 text-amber-800" },
  { value: "pending_payment", label: "Ожидает оплаты", color: "bg-blue-100 text-blue-800" },
  { value: "paid", label: "Оплачен", color: "bg-green-100 text-green-800" },
  { value: "shipped", label: "Отправлен", color: "bg-purple-100 text-purple-800" },
  { value: "delivered", label: "Доставлен", color: "bg-gray-100 text-gray-800" },
];

// Объявляем тип Order согласно схеме данных
type OrderWithTypedFields = {
  id: number;
  userId: number;
  items: any[]; // TODO: заменить на конкретный тип
  totalAmount: string;
  deliveryAmount: string;
  fullName: string;
  phone: string;
  address: string;
  socialNetwork: string | null;
  socialUsername: string | null;
  deliveryType: string;
  deliverySpeed: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  needStorage: boolean;
  needInsulation: boolean;
  paymentProofUrl: string | null;
  adminComment: string | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export default function OrdersList() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithTypedFields | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [adminComment, setAdminComment] = useState("");
  
  const { data: orders = [], isLoading, refetch } = useQuery<OrderWithTypedFields[]>({
    queryKey: ["/api/orders"],
    queryFn: async () => {
      const res = await fetch("/api/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка загрузки заказов");
      return res.json();
    }
  });
  
  const { data: users = [] } = useQuery<{ id: string; email: string; }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/users", { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch (error) {
        console.error("Ошибка загрузки пользователей:", error);
        return [];
      }
    },
    enabled: true
  });
  
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number, status: string }) => {
      console.log(`Обновление статуса заказа #${orderId} на ${status}`);
      const response = await apiRequest("PUT", `/api/orders/${orderId}`, { 
        orderStatus: status 
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Ошибка при обновлении статуса");
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      console.log("Статус заказа успешно обновлен:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      refetch(); // Явно вызываем обновление данных
      toast({
        title: "Статус обновлен",
        description: "Статус заказа успешно обновлен",
        variant: "success"
      });
    },
    onError: (error: Error) => {
      console.error("Ошибка обновления статуса:", error);
      toast({
        title: "Ошибка обновления",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  const updateOrderCommentMutation = useMutation({
    mutationFn: async ({ orderId, comment }: { orderId: number, comment: string }) => {
      await apiRequest("PUT", `/api/orders/${orderId}`, { adminComment: comment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      refetch(); // Явно вызываем обновление данных
      toast({
        title: "Комментарий сохранен",
        description: "Комментарий к заказу успешно сохранен",
        variant: "success"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiRequest("DELETE", `/api/orders/${orderId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      refetch(); // Явно вызываем обновление данных
      toast({
        title: "Заказ удален",
        description: "Заказ успешно удален из системы",
        variant: "success"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  const handleStatusChange = (orderId: number, status: string) => {
    if (confirm(`Вы уверены, что хотите изменить статус заказа на "${ORDER_STATUSES.find(s => s.value === status)?.label || status}"?`)) {
    updateOrderStatusMutation.mutate({ orderId, status });
    }
  };
  
  const handleViewOrder = (order: OrderWithTypedFields) => {
    // Убедимся, что items - это массив
    const processedOrder = {
      ...order,
      items: order.items && typeof order.items === 'string' 
        ? JSON.parse(order.items) 
        : Array.isArray(order.items) ? order.items : []
    };
    setSelectedOrder(processedOrder);
    setAdminComment(processedOrder.adminComment || "");
    setShowOrderDetails(true);
  };
  
  const handleSaveComment = () => {
    if (selectedOrder) {
      updateOrderCommentMutation.mutate({
        orderId: selectedOrder.id,
        comment: adminComment
      });
      setShowOrderDetails(false);
    }
  };

  const handleDeleteOrder = (orderId: number) => {
    if (confirm("Вы уверены, что хотите удалить этот заказ? Это действие нельзя отменить.")) {
      deleteOrderMutation.mutate(orderId);
    }
  };
  
  const getStatusBadge = (status: string) => {
    const statusInfo = ORDER_STATUSES.find(s => s.value === status);
    return (
      <Badge className={statusInfo?.color || "bg-gray-100 text-gray-800"}>
        {statusInfo?.label || status}
      </Badge>
    );
  };
  
  const filteredOrders = orders?.filter(order => {
    // Фильтр по статусу
    if (statusFilter && order.orderStatus !== statusFilter) {
      return false;
    }
    
    // Поиск по ID, имени, телефону или адресу
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        order.id.toString().includes(query) ||
        order.fullName.toLowerCase().includes(query) ||
        order.phone.toLowerCase().includes(query) ||
        order.address.toLowerCase().includes(query)
      );
    }
    
    return true;
  });
  
  // Форматирование суммы
  const formatPrice = (price: number | string | null | undefined): string => {
    if (!price) return "0";
    const numPrice = typeof price === "string" ? parseFloat(price) : price;
    return numPrice.toLocaleString("ru-RU");
  };
  
  // Нормализация URL изображения
  const normalizeImageUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    
    // Абсолютный URL - возвращаем как есть
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Относительный URL - добавляем origin
    if (url.startsWith('/')) {
      return `${window.location.origin}${url}`;
    }
    
    // Без начального слеша - добавляем
    return `${window.location.origin}/${url}`;
  };
  
  // Функция для скачивания изображения чека
  const downloadImage = (imageUrl: string, orderId: number) => {
    if (!imageUrl) {
      toast({
        title: "Ошибка",
        description: "Ссылка на чек отсутствует",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Формируем полный URL если это относительный путь
      const fullUrl = imageUrl.startsWith('http') 
        ? imageUrl 
        : `${window.location.origin}${imageUrl}`;
      
      // Открываем изображение в новой вкладке
      window.open(fullUrl, '_blank');
    } catch (error) {
      console.error("Ошибка при скачивании чека:", error);
      toast({
        title: "Ошибка скачивания",
        description: "Не удалось скачать изображение чека",
        variant: "destructive"
      });
    }
  };
  
  // Функция для экспорта заказов в CSV
  const exportOrdersToCSV = () => {
    if (!orders || orders.length === 0) {
      toast({
        title: "Нет данных для экспорта",
        description: "Список заказов пуст",
        variant: "destructive"
      });
      return;
    }

    try {
      // Вместо создания CSV на клиенте, используем серверный API для экспорта
      const exportUrl = `${import.meta.env.VITE_API_BASE_URL || ''}/api/export/orders`;

      // Создаем ссылку и автоматически скачиваем файл
      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = `orders_export_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Экспорт успешно выполнен",
        description: `Файл с заказами скачивается...`,
      });
    } catch (error) {
      console.error("Ошибка при экспорте заказов:", error);
      toast({
        title: "Ошибка экспорта",
        description: "Не удалось экспортировать данные",
        variant: "destructive"
      });
    }
  };
  
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Управление заказами</h2>
      
      <Card className="mb-6">
        <div className="p-4 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Поиск заказов по ID, имени, телефону или адресу"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select 
            value={statusFilter === null ? "all" : statusFilter} 
            onValueChange={(value) => setStatusFilter(value === "all" ? null : value)}
          >
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {ORDER_STATUSES.map(status => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={exportOrdersToCSV} 
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={isLoading || !orders || orders.length === 0}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Экспорт в CSV
          </Button>
        </div>
      </Card>
      
      {isLoading ? (
        <div className="text-center py-10">
          <p className="text-gray-500">Загрузка заказов...</p>
        </div>
      ) : !filteredOrders || filteredOrders.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <p className="text-gray-500">
            {searchQuery || statusFilter
              ? "Нет заказов, соответствующих фильтрам"
              : "Нет доступных заказов"
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Клиент</TableHead>
                <TableHead>Сумма</TableHead>
                <TableHead>Доставка</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.id}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{order.fullName}</div>
                      <div className="text-sm text-gray-500">{order.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {parseFloat(order.totalAmount).toLocaleString()} ₽
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>{order.deliveryType === "cdek" ? "СДЭК" : "Почта России"}</div>
                      <div className="text-sm text-gray-500">
                        {order.deliverySpeed === "express" ? "Экспресс" : "Стандарт"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={order.orderStatus}
                      onValueChange={(value) => handleStatusChange(order.id, value)}
                      disabled={updateOrderStatusMutation.isPending}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue>{getStatusBadge(order.orderStatus)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map(status => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {new Date(order.createdAt || Date.now()).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleViewOrder(order)}
                        title="Просмотреть детали"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteOrder(order.id)}
                        title="Удалить заказ"
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      
      {showOrderDetails && selectedOrder && (
        <Dialog open={showOrderDetails} onOpenChange={() => setShowOrderDetails(false)}>
          <DialogContent className="max-w-3xl">
          <DialogHeader>
              <DialogTitle>Детали заказа #{selectedOrder.id}</DialogTitle>
            <DialogDescription>
                Заказ от {selectedOrder.createdAt ? (() => {
                  try {
                    // Форматируем дату для отображения
                    const date = new Date(selectedOrder.createdAt);
                    if (isNaN(date.getTime())) {
                      return 'Дата неизвестна';
                    }
                    return date.toLocaleDateString('ru-RU', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  } catch (error) {
                    console.error("Ошибка при форматировании даты:", error);
                    return 'Дата неизвестна';
                  }
                })() : 'Дата неизвестна'}
            </DialogDescription>
          </DialogHeader>
          
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm">Статус заказа</h4>
                  <Badge 
                    variant={selectedOrder.orderStatus === 'completed' ? 'default' : 
                      selectedOrder.orderStatus === 'pending' ? 'outline' : 'secondary'}
                  >
                    {ORDER_STATUSES.find(s => s.value === selectedOrder.orderStatus)?.label || selectedOrder.orderStatus}
                  </Badge>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm">Сумма</h4>
                  <p>{typeof selectedOrder.totalAmount === 'string' && !isNaN(parseFloat(selectedOrder.totalAmount)) 
                    ? parseFloat(selectedOrder.totalAmount).toLocaleString('ru-RU') 
                    : typeof selectedOrder.totalAmount === 'number' 
                      ? selectedOrder.totalAmount.toLocaleString('ru-RU')
                      : '0'} ₽</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm">Информация о пользователе</h4>
                  <p>Имя: {selectedOrder.fullName || 'Не указано'}</p>
                  <p>Телефон: {selectedOrder.phone || 'Не указан'}</p>
                  <p>Email: {selectedOrder.userId ? (() => {
                    try {
                      const user = users?.find(u => String(u.id) === String(selectedOrder.userId));
                      return user?.email || 'Не найден';
                    } catch (error) {
                      console.error("Ошибка при поиске email пользователя:", error);
                      return 'Ошибка поиска';
                    }
                  })() : 'Не указан'}</p>
                  <p>Адрес: {selectedOrder.address || 'Не указан'}</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm">Способ оплаты</h4>
                  <p>{selectedOrder.paymentMethod === 'balance' 
                    ? 'С баланса' 
                    : selectedOrder.paymentMethod === 'yoomoney' 
                      ? 'ЮMoney' 
                      : 'Банковской картой'}</p>
                  
                  {selectedOrder.paymentProofUrl && (
                    <div className="mt-2">
                      <p className="text-sm font-medium mb-1">Чек об оплате:</p>
                      <div className="border rounded p-2 inline-flex flex-col gap-2">
                        <a 
                          href={normalizeImageUrl(selectedOrder.paymentProofUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center"
                        >
                          <ImageIcon className="h-4 w-4 mr-1" />
                          Посмотреть изображение
                        </a>
                        <div className="relative">
                          <div className="w-full max-w-xs h-40 bg-gray-100 flex items-center justify-center rounded">
                            <img 
                              src={normalizeImageUrl(selectedOrder.paymentProofUrl)}
                              alt="Чек об оплате" 
                              className="max-h-full max-w-full object-contain"
                              onError={(e) => {
                                console.error("Ошибка загрузки изображения чека:", selectedOrder.paymentProofUrl);
                                const imgElement = e.currentTarget as HTMLImageElement;
                                imgElement.src = "https://placehold.co/400x300?text=Ошибка+загрузки+чека";
                                imgElement.onerror = null;
                                
                                // Выводим сообщение о проблеме с загрузкой
                                toast({
                                  title: "Ошибка загрузки изображения",
                                  description: "Проблема с загрузкой чека. Возможно, файл не существует или путь неверен.",
                                  variant: "destructive"
                                });
                              }}
                            />
                          </div>
                          <div className="flex justify-between mt-2">
                            <div className="text-xs text-gray-500 truncate max-w-[150px]" title={selectedOrder.paymentProofUrl}>
                              {selectedOrder.paymentProofUrl}
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                if (selectedOrder.paymentProofUrl) {
                                  try {
                                    window.open(normalizeImageUrl(selectedOrder.paymentProofUrl), '_blank');
                                  } catch (error) {
                                    console.error("Ошибка открытия чека:", error);
                                    toast({
                                      title: "Ошибка открытия чека",
                                      description: "Не удалось открыть изображение чека",
                                      variant: "destructive"
                                    });
                                  }
                                }
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" /> Скачать
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-sm mb-2">Товары</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead className="text-right">Цена</TableHead>
                      <TableHead className="text-center">Кол-во</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                      selectedOrder.items.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{item.productName || item.name || 'Товар без названия'}</TableCell>
                          <TableCell className="text-right">{parseFloat(String(item.price || 0)).toLocaleString('ru-RU')} ₽</TableCell>
                          <TableCell className="text-center">{item.quantity || 1}</TableCell>
                          <TableCell className="text-right">{(parseFloat(String(item.price || 0)) * (parseInt(String(item.quantity || 1)))).toLocaleString('ru-RU')} ₽</TableCell>
                        </TableRow>
                      ))
                    ) : typeof selectedOrder.items === 'string' ? (
                      (() => {
                        try {
                          const parsedItems = JSON.parse(selectedOrder.items);
                          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
                            return parsedItems.map((item: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{item.productName || item.name || 'Товар без названия'}</TableCell>
                                <TableCell className="text-right">{parseFloat(String(item.price || 0)).toLocaleString('ru-RU')} ₽</TableCell>
                                <TableCell className="text-center">{item.quantity || 1}</TableCell>
                                <TableCell className="text-right">{(parseFloat(String(item.price || 0)) * (parseInt(String(item.quantity || 1)))).toLocaleString('ru-RU')} ₽</TableCell>
                              </TableRow>
                            ));
                          }
                          
                          // Если не смогли получить товары, но есть общая сумма
                          if (selectedOrder.totalAmount && parseFloat(String(selectedOrder.totalAmount)) > 0) {
                            return (
                              <TableRow>
                                <TableCell>Товар из заказа</TableCell>
                                <TableCell className="text-right">{parseFloat(String(selectedOrder.totalAmount)).toLocaleString('ru-RU')} ₽</TableCell>
                                <TableCell className="text-center">1</TableCell>
                                <TableCell className="text-right">{parseFloat(String(selectedOrder.totalAmount)).toLocaleString('ru-RU')} ₽</TableCell>
                              </TableRow>
                            );
                          }
                          
                          return (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-4 text-gray-500">
                                Не удалось обработать данные о товарах
                              </TableCell>
                            </TableRow>
                          );
                        } catch (error) {
                          console.error("Ошибка при обработке товаров:", error);
                          return (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-4 text-gray-500">
                                Ошибка при обработке данных товаров
                              </TableCell>
                            </TableRow>
                          );
                        }
                      })()
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-gray-500">
                          Нет данных о товарах
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-bold">
                        Итого:
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {typeof selectedOrder.totalAmount === 'string' && !isNaN(parseFloat(selectedOrder.totalAmount))
                          ? parseFloat(selectedOrder.totalAmount).toLocaleString('ru-RU')
                          : '0'} ₽
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              
              <div>
                <h4 className="font-medium text-sm">Комментарий администратора</h4>
                <Textarea 
                  value={adminComment} 
                  onChange={(e) => setAdminComment(e.target.value)}
                  placeholder="Введите комментарий к заказу..."
                  className="min-h-[80px]"
                />
              </div>
                  </div>
          
          <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowOrderDetails(false)}
              >
                Отмена
              </Button>
            <Button 
              onClick={handleSaveComment}
              disabled={updateOrderCommentMutation.isPending}
            >
                {updateOrderCommentMutation.isPending ? 'Сохранение...' : 'Сохранить комментарий'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}