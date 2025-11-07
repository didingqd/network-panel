import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { getNodeNetworkStats, getNodeNetworkStatsBatch, getNodeList, getNodeSysinfo } from "@/api";
import { useRef } from "react";
import toast from "react-hot-toast";

const ranges = [
  { key: '1h', label: '每小时' },
  { key: '12h', label: '每12小时' },
  { key: '1d', label: '每天' },
  { key: '7d', label: '每七天' },
  { key: '30d', label: '每月' },
];

export default function NetworkPage() {
  const params = useParams();
  const navigate = useNavigate();
  const nodeId = Number(params.id);
  const [range, setRange] = useState('1h');
  const [data, setData] = useState<any>({ results: [], targets: {}, disconnects: [], sla: 0 });
  const [nodes, setNodes] = useState<any[]>([]);
  const [batch, setBatch] = useState<any>({});
  const [sysMap, setSysMap] = useState<Record<number, any>>({});
  const [cycleOverride, setCycleOverride] = useState<Record<number, number>>({});
  const [nodeName, setNodeName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      if (params.id) {
        const res = await getNodeNetworkStats(nodeId, range);
        if (res.code === 0) setData(res.data || { results: [], disconnects: [], sla: 0 });
        else toast.error(res.msg || '加载失败');
      } else {
        const [l, b] = await Promise.all([getNodeList(), getNodeNetworkStatsBatch(range)]);
        if (l.code === 0) {
          const arr = (l.data || []) as any[];
          setNodes(arr);
          // fetch latest sysinfo per node (limit 1)
          const entries = await Promise.all(arr.map(async (n:any)=>{
            try { const r:any = await getNodeSysinfo(n.id, '1h', 1); if (r.code===0 && Array.isArray(r.data) && r.data.length>0) return [n.id, r.data[r.data.length-1]]; } catch {}
            return [n.id, null];
          }));
          const m: Record<number, any> = {};
          entries.forEach(([id, s]: any)=>{ if (s) m[id]=s; });
          setSysMap(m);
        }
        if (b.code === 0) setBatch(b.data || {});
      }
    } catch { toast.error('网络错误'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [params.id, range]);

  // fetch node name for detail page
  useEffect(() => {
    if (params.id) {
      getNodeList().then((res:any)=>{
        if (res.code===0 && Array.isArray(res.data)){
          const n = res.data.find((x:any)=>x.id===Number(params.id));
          if (n) setNodeName(n.name||`节点 ${params.id}`);
        }
      }).catch(()=>{});
    } else {
      setNodeName("");
    }
  }, [params.id]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const r of (data.results || [])) {
      const k = String(r.targetId);
      (g[k] ||= []).push(r);
    }
    return g;
  }, [data]);

  useEffect(() => {
    const render = async () => {
      if (!chartRef.current) return;
      const echarts = await import('echarts');
      if (!chartInstanceRef.current) {
        chartInstanceRef.current = echarts.init(chartRef.current);
      }
      const series: any[] = [];
      Object.keys(grouped).forEach((tid) => {
        const arr = grouped[tid];
        const label = data.targets?.[tid]?.name || `目标${tid}`;
        series.push({
          type: 'line', sampling: 'lttb',
          name: `${label} RTT`,
          showSymbol: false,
          yAxisIndex: 0,
          data: arr.map((it:any)=>[it.timeMs, it.ok? it.rttMs : null])
        });
        series.push({
          type: 'line', sampling: 'lttb',
          name: `${label} 丢包%`,
          showSymbol: false,
          yAxisIndex: 1,
          data: arr.map((it:any)=>[it.timeMs, it.ok? 0 : 100])
        });
      });
      chartInstanceRef.current.setOption({
        tooltip: { trigger: 'axis' },
        legend: { type: 'scroll' },
        dataZoom: [
          { type: 'inside', throttle: 50 },
          { type: 'slider', height: 20 }
        ],
        xAxis: { type: 'time' },
        yAxis: [
          { type: 'value', name: 'RTT (ms)' },
          { type: 'value', name: '丢包(%)', min: 0, max: 100, axisLabel: { formatter: '{value}%' } }
        ],
        series,
        grid: { left: 40, right: 20, top: 40, bottom: 30 }
      });
      window.addEventListener('resize', handleResize);
    };
    const handleResize = () => { try { chartInstanceRef.current?.resize(); } catch {} };
    render();
    return () => { window.removeEventListener('resize', handleResize); };
  }, [grouped, data.targets]);

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        {params.id ? (
          <>
            <h2 className="text-xl font-semibold">{nodeName || `节点 ${params.id}`} 网络详情</h2>
            <div className="text-sm text-default-500">SLA：{(data.sla*100).toFixed(2)}%</div>
          </>
        ) : (
          <h2 className="text-xl font-semibold">节点网络概览</h2>
        )}
      </div>

      <div className="flex gap-2">
        {ranges.map(r => (
          <Button key={r.key} size="sm" variant={range===r.key? 'solid':'flat'} color={range===r.key? 'primary':'default'} onPress={()=>setRange(r.key)}>
            {r.label}
          </Button>
        ))}
      </div>

      {params.id ? (
      <Card>
        <CardHeader className="justify-between">
          <div className="font-semibold">Ping 统计（按目标）</div>
          <Button size="sm" variant="flat" onPress={load} isLoading={loading}>刷新</Button>
        </CardHeader>
        <CardBody>
          <div className="h-[360px]" ref={chartRef} />
        </CardBody>
      </Card>
      ) : (
      <Card>
        <CardHeader className="justify-between">
          <div className="font-semibold">节点网络概览（{range}）</div>
          <Button size="sm" variant="flat" onPress={load} isLoading={loading}>刷新</Button>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {nodes.map((n:any)=>{
              const s = batch?.[n.id] || {};
              const avg = s.avg ?? null; const latest = s.latest ?? null;
              const sys = sysMap[n.id];
              const online = (n.status === 1);
              const formatUptime = (seconds:number) => {
                if (!seconds) return '-'; const d=Math.floor(seconds/86400); const h=Math.floor((seconds%86400)/3600); const m=Math.floor((seconds%3600)/60);
                return d>0? `${d}天${h}小时` : (h>0? `${h}小时${m}分钟` : `${m}分钟`);
              };
              const fmtTraffic = (bytes:number) => {
                if (!bytes) return '0 B'; const k=1024; const u=['B','KB','MB','GB','TB']; const i=Math.floor(Math.log(bytes)/Math.log(k)); return `${(bytes/Math.pow(k,i)).toFixed(2)} ${u[i]}`;
              };
              const remainDays = () => {
                const cd = cycleOverride[n.id] || n.cycleDays;
                if (!cd || !n.startDateMs) return '';
                const now = Date.now(); const cycleMs = cd*24*3600*1000; const elapsed=Math.max(0, now - n.startDateMs); const remain=cycleMs - (elapsed % cycleMs);
                const days = Math.ceil(remain/(24*3600*1000)); return `${days} 天`;
              };
              return (
                <div key={n.id} className="p-3 rounded border border-divider hover:shadow-sm transition cursor-pointer" onClick={()=>navigate(`/network/${n.id}`)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold truncate">{n.name}</div>
                    <span className={`text-2xs px-2 py-0.5 rounded ${online? 'bg-success-100 text-success-700':'bg-danger-100 text-danger-700'}`}>{online? '在线':'离线'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-default-600 mb-0.5">CPU</div>
                      <div className="font-mono">{online && sys? `${(sys.cpu).toFixed?.(1) || sys.cpu}%` : '-'}</div>
                    </div>
                    <div>
                      <div className="text-default-600 mb-0.5">内存</div>
                      <div className="font-mono">{online && sys? `${(sys.mem).toFixed?.(1) || sys.mem}%` : '-'}</div>
                    </div>
                    <div>
                      <div className="text-default-600 mb-0.5">开机时间</div>
                      <div className="font-mono">{online && sys? formatUptime(sys.uptime) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-default-600 mb-0.5">网络</div>
                      <div className="font-mono">{latest!=null? `${latest} ms` : '-'}{avg!=null? ` · 平均 ${avg} ms`: ''}</div>
                    </div>
                    <div>
                      <div className="text-default-600 mb-0.5">↑ 上行流量</div>
                      <div className="font-mono">{online && sys? fmtTraffic(sys.bytes_tx||0): '-'}</div>
                    </div>
                    <div>
                      <div className="text-default-600 mb-0.5">↓ 下行流量</div>
                      <div className="font-mono">{online && sys? fmtTraffic(sys.bytes_rx||0): '-'}</div>
                    </div>
                  </div>
                  {(n.priceCents || n.cycleDays) && (
                    <div className="mt-2 text-xs text-default-600">
                      计费：{n.priceCents? `¥${(n.priceCents/100).toFixed(2)}`: ''}{(cycleOverride[n.id]||n.cycleDays)? ` / ${(cycleOverride[n.id]||n.cycleDays)}天`: ''}{n.startDateMs? ` · 剩余${remainDays()}`: ''}
                      <div className="mt-1 flex items-center gap-2">
                        <span>续费周期</span>
                        <select className="text-xs border rounded px-1 py-0.5"
                          value={String(cycleOverride[n.id] || n.cycleDays || '')}
                          onClick={(e)=>e.stopPropagation()}
                          onChange={(e)=>{ const v = Number(e.target.value); setCycleOverride(prev=>({...prev, [n.id]: v||undefined as any})); }}
                        >
                          <option value="">默认</option>
                          <option value="30">月(30天)</option>
                          <option value="90">季度(90天)</option>
                          <option value="180">半年(180天)</option>
                          <option value="365">年(365天)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardBody>
      </Card>
      )}

      {params.id && (
      <Card>
        <CardHeader className="font-semibold">断联记录</CardHeader>
        <CardBody>
          <div className="space-y-2 text-sm">
            {(data.disconnects || []).map((it:any)=>{
              const dur = it.durationS ? it.durationS : (it.upAtMs ? Math.round((it.upAtMs - it.downAtMs)/1000) : null);
              return (
                <div key={it.id} className="flex justify-between p-2 rounded bg-default-50">
                  <div>开始：{new Date(it.downAtMs).toLocaleString()}</div>
                  <div>恢复：{it.upAtMs ? new Date(it.upAtMs).toLocaleString() : '-'}</div>
                  <div>时长：{dur !== null ? `${dur}s` : '-'}</div>
                </div>
              )
            })}
            {(!data.disconnects || data.disconnects.length===0) && <div className="text-default-500">暂无记录</div>}
          </div>
        </CardBody>
      </Card>
      )}
    </div>
  );
}
