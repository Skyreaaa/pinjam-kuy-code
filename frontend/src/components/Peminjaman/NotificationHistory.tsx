import React, { useEffect, useState } from 'react';
import { loanApi } from '../../services/api';
import { FaArrowLeft, FaCheckCircle, FaTimesCircle, FaBell } from 'react-icons/fa';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import './BorrowingPage.css';

interface NotificationHistoryProps {
  onBack: () => void;
}

type NotificationItem = {
  id: number;
  bookTitle: string;
  status: string;
  approvedAt?: string;
  actualReturnDate?: string;
  returnDecision?: 'approved' | 'rejected';
  rejectionDate?: string;
  kind?: 'loan_approved'|'loan_rejected'|'return_approved'|'return_rejected'|'fine_imposed'|'fine_paid'|'fine_rejected';
  amount?: number;
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd MMM yyyy HH:mm', { locale: id });
  } catch {
    return value;
  }
};

const NotificationHistory: React.FC<NotificationHistoryProps> = ({ onBack }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [res, loans] = await Promise.all([
          loanApi.notificationHistory(),
          loanApi.userLoans(),
        ]);
        if (!res.success) {
          setError((res as any as string) || 'Gagal mengambil riwayat notifikasi.');
        }
        const baseItems: NotificationItem[] = (res.items || []).map(it => {
          let kind: NotificationItem['kind'] = 'loan_approved';
          if (it.returnDecision === 'approved') kind = 'return_approved';
          else if (it.returnDecision === 'rejected') kind = 'return_rejected';
          else if (it.rejectionDate) kind = 'loan_rejected';
          else kind = 'loan_approved';
          return { ...it, kind } as NotificationItem;
        });

        // Derive fine-related entries from current loans snapshot
        const fineItems: NotificationItem[] = (loans || []).flatMap((l: any) => {
          const arr: NotificationItem[] = [];
          const amount = (l.penaltyAmount ?? l.fineAmount ?? 0) as number;
          if (l.finePaymentStatus === 'awaiting_proof' && amount > 0) {
            arr.push({ id: l.id, bookTitle: l.bookTitle, status: l.status, kind: 'fine_imposed', amount });
          }
          if (l.finePaymentStatus === 'paid') {
            arr.push({ id: l.id, bookTitle: l.bookTitle, status: l.status, kind: 'fine_paid', amount });
          }
          if (l.finePaymentStatus === 'awaiting_proof' && l.returnProofRejected) {
            arr.push({ id: l.id, bookTitle: l.bookTitle, status: l.status, kind: 'fine_rejected' });
          }
          return arr;
        });

        // Merge and de-duplicate by id+kind
        const key = (x: NotificationItem) => `${x.id}_${x.kind || 'unknown'}`;
        const mergedMap = new Map<string, NotificationItem>();
        [...baseItems, ...fineItems].forEach(item => {
          mergedMap.set(key(item), item);
        });
        setItems(Array.from(mergedMap.values()));
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Gagal mengambil riwayat notifikasi.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderIcon = (item: NotificationItem) => {
    const kind = item.kind;
    if (kind === 'return_approved') return <FaCheckCircle className="notif-icon success" />;
    if (kind === 'return_rejected' || kind === 'loan_rejected' || kind === 'fine_rejected') return <FaTimesCircle className="notif-icon error" />;
    if (kind === 'fine_paid') return <FaCheckCircle className="notif-icon success" />;
    if (kind === 'fine_imposed') return <FaBell className="notif-icon info" />;
    // default loan approved
    return <FaBell className="notif-icon info" />;
  };

  const renderLabel = (item: NotificationItem) => {
    switch (item.kind) {
      case 'return_approved': return 'Pengembalian Disetujui';
      case 'return_rejected': return 'Bukti Pengembalian Ditolak';
      case 'loan_rejected': return 'Pinjaman Ditolak';
      case 'fine_imposed': return 'Denda Ditetapkan';
      case 'fine_paid': return 'Pembayaran Denda Disetujui';
      case 'fine_rejected': return 'Pembayaran Denda Ditolak';
      case 'loan_approved':
      default:
        return 'Pinjaman Disetujui';
    }
  };

  const renderDate = (item: NotificationItem) => {
    return formatDate(item.actualReturnDate || item.approvedAt || item.rejectionDate);
  };

  const formatIDR = (n?: number) => typeof n === 'number'
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
    : '';

  return (
    <div className="book-detail-container-v5">
      <div className="header-v5">
        <button className="back-button-v5" onClick={onBack} aria-label="Kembali">
          <FaArrowLeft />
        </button>
        <h1 className="header-title-v5">Riwayat Notifikasi</h1>
      </div>

      <div className="main-content-area-v5 detail-view">
        {loading && <p className="loading-bar">Memuat riwayat notifikasi...</p>}
        {error && !loading && <p className="status-message error">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="status-message">Belum ada notifikasi.</p>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="notification-history-list">
            {items.map(item => (
              <li key={item.id} className="notification-history-item">
                <div className="notif-icon-wrapper">{renderIcon(item)}</div>
                <div className="notif-text">
                  <p className="notif-label">{renderLabel(item)}</p>
                  <p className="notif-book">{item.bookTitle}</p>
                  <p className="notif-meta">{renderDate(item)}{item.kind?.startsWith('fine') && item.amount ? ` • ${formatIDR(item.amount)}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NotificationHistory;
