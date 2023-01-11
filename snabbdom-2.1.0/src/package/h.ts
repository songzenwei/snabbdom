import { vnode, VNode, VNodeData } from './vnode'
import * as is from './is'

export type VNodes = VNode[]
export type VNodeChildElement = VNode | string | number | undefined | null
export type ArrayOrElement<T> = T | T[]
export type VNodeChildren = ArrayOrElement<VNodeChildElement>

function addNS (data: any, children: VNodes | undefined, sel: string | undefined): void {
  data.ns = 'http://www.w3.org/2000/svg'
  if (sel !== 'foreignObject' && children !== undefined) {
    for (let i = 0; i < children.length; ++i) {
      const childData = children[i].data
      if (childData !== undefined) {
        addNS(childData, (children[i] as VNode).children as VNodes, children[i].sel)
      }
    }
  }
}

// 函数重载
export function h (sel: string): VNode
export function h (sel: string, data: VNodeData | null): VNode
export function h (sel: string, children: VNodeChildren): VNode
export function h (sel: string, data: VNodeData | null, children: VNodeChildren): VNode
export function h (sel: any, b?: any, c?: any): VNode {
  var data: VNodeData = {}
  var children: any
  var text: any
  var i: number
  // 处理参数，实现重载的机制
  if (c !== undefined) {
    // 处理三个参数的情况
    // sel, data ,children/text
    if (b !== null) {
      data = b
    }
    // 如果是数组
    if (is.array(c)) {
      children = c
      // 如果c是 string/number (文本节点)
    } else if (is.primitive(c)) {
      text = c
      // 如果c是 VNode
    } else if (c && c.sel) {
      children = [c]
    }
  } else if (b !== undefined && b !== null) {
    // 如果是两个参数的情况
    // 如果b是数组
    if (is.array(b)) {
      children = b
      // 如果 b 是 字符串或者数字
    } else if (is.primitive(b)) {
      text = b
      // 如果 b 是VNODE
    } else if (b && b.sel) {
      children = [b]
    } else { data = b }
  }

  // 如果 children 存在
  if (children !== undefined) {
    // 处理children中的原始值 (string/number)
    for (i = 0; i < children.length; ++i) {
      // 如果 child 是 string/number，创建文本节点
      if (is.primitive(children[i])) children[i] = vnode(undefined, undefined, undefined, children[i], undefined)
    }
  }
  // 如果是svg
  if (
    sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    // 添加命名空间
    addNS(data, children, sel)
  }
  // 返回 VNode
  return vnode(sel, data, children, text, undefined)
};
