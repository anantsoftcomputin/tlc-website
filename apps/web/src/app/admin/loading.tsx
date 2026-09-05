export default function AdminLoading() {
  return <div className="admin-loading" role="status" aria-label="Loading workspace">
    <div className="admin-loading-head"><span/><span/><span/></div>
    <div className="admin-loading-metrics">{Array.from({ length: 4 }, (_, index) => <span key={index}/>)}</div>
    <div className="admin-loading-panel"><span/><span/><span/><span/><span/></div>
  </div>;
}
